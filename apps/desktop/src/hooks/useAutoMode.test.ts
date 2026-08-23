import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AutoTurn } from "@/ipc/types";

type Handler = (payload: never) => void;
const handlers = new Map<string, Handler>();
const startAutoMode = vi.fn<() => Promise<null>>(() => Promise.resolve(null));
const stopAutoMode = vi.fn<() => Promise<void>>(() => Promise.resolve());
const autoModeActive = vi.fn<() => Promise<boolean>>(() => Promise.resolve(false));

vi.mock("@/ipc/events", () => ({
  onEvent: (name: string, handler: Handler) => {
    handlers.set(name, handler);
    return () => {
      handlers.delete(name);
    };
  },
}));
vi.mock("@/ipc/commands", () => ({
  startAutoMode: () => startAutoMode(),
  stopAutoMode: () => stopAutoMode(),
  autoModeActive: () => autoModeActive(),
}));

import { useAutoMode } from "./useAutoMode";

const SUBMIT_DEBOUNCE_MS = 900;

function emit(name: string, payload: unknown) {
  act(() => {
    handlers.get(name)?.(payload as never);
  });
}

function turn(seq: number, speaker: AutoTurn["speaker"], text: string): AutoTurn {
  return { seq, speaker, text, atMs: 1000 + seq };
}

function settle() {
  act(() => {
    vi.advanceTimersByTime(SUBMIT_DEBOUNCE_MS);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  handlers.clear();
  vi.clearAllMocks();
});

describe("useAutoMode", () => {
  it("копит реплики по порядку независимо от порядка прихода", () => {
    const { result } = renderHook(() => useAutoMode(vi.fn(() => true)));
    emit("auto-turn", turn(1, "user", "второй"));
    emit("auto-turn", turn(0, "interviewer", "первый"));
    expect(result.current.turns.map((t) => t.seq)).toEqual([0, 1]);
  });

  it("отправляет вопрос интервьюера после паузы", () => {
    const onSubmit = vi.fn(() => true);
    renderHook(() => useAutoMode(onSubmit));
    emit("auto-turn", turn(0, "interviewer", "Что такое GC?"));
    expect(onSubmit).not.toHaveBeenCalled();
    settle();
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith("Что такое GC?");
  });

  it("склеивает разорванный вопрос в одну отправку", () => {
    const onSubmit = vi.fn(() => true);
    renderHook(() => useAutoMode(onSubmit));
    emit("auto-turn", turn(0, "interviewer", "Что такое"));
    act(() => {
      vi.advanceTimersByTime(SUBMIT_DEBOUNCE_MS / 2);
    });
    emit("auto-turn", turn(1, "interviewer", "сборка мусора?"));
    settle();
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith("Что такое сборка мусора?");
  });

  it("не отправляет речь пользователя саму по себе", () => {
    const onSubmit = vi.fn(() => true);
    renderHook(() => useAutoMode(onSubmit));
    emit("auto-turn", turn(0, "user", "Думаю вслух."));
    settle();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("прикладывает ответ пользователя к следующему вопросу и не повторяет отправленное", () => {
    const onSubmit = vi.fn(() => true);
    renderHook(() => useAutoMode(onSubmit));
    emit("auto-turn", turn(0, "interviewer", "Что такое GC?"));
    settle();
    emit("auto-turn", turn(1, "user", "Сборщик мусора."));
    settle();
    emit("auto-turn", turn(2, "interviewer", "А какие бывают?"));
    settle();
    expect(onSubmit.mock.calls).toEqual([
      ["Что такое GC?"],
      ["Я: Сборщик мусора.\nИнтервьюер: А какие бывают?"],
    ]);
  });

  it("повтор той же реплики не даёт второй отправки", () => {
    const onSubmit = vi.fn(() => true);
    renderHook(() => useAutoMode(onSubmit));
    emit("auto-turn", turn(0, "interviewer", "Вопрос?"));
    settle();
    emit("auto-turn", turn(0, "interviewer", "Вопрос?"));
    settle();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("выключение режима чистит накопленное, и следующая сессия начинается с нуля", () => {
    const onSubmit = vi.fn(() => true);
    const { result } = renderHook(() => useAutoMode(onSubmit));
    emit("auto-mode-changed", { active: true });
    emit("auto-turn", turn(7, "interviewer", "Старый вопрос?"));
    emit("auto-mode-changed", { active: false });
    expect(result.current.active).toBe(false);
    expect(result.current.turns).toEqual([]);
    settle();
    expect(onSubmit).not.toHaveBeenCalled();

    emit("auto-mode-changed", { active: true });
    emit("auto-turn", turn(0, "interviewer", "Новый вопрос?"));
    settle();
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith("Новый вопрос?");
  });

  it("тумблер стартует и останавливает потоки на бэкенде", async () => {
    const { result } = renderHook(() => useAutoMode(vi.fn(() => true)));
    act(() => {
      result.current.toggle();
    });
    expect(startAutoMode).toHaveBeenCalledTimes(1);

    emit("auto-mode-changed", { active: true });
    await waitFor(() => {
      expect(result.current.active).toBe(true);
    });
    act(() => {
      result.current.toggle();
    });
    expect(stopAutoMode).toHaveBeenCalledTimes(1);
  });

  it("отказ старта показывается кодом ошибки, а не текстом", async () => {
    startAutoMode.mockRejectedValueOnce({ code: "permission", message: "Нет микрофона" });
    const { result } = renderHook(() => useAutoMode(vi.fn(() => true)));
    act(() => {
      result.current.toggle();
    });
    await waitFor(() => {
      expect(result.current.error).toEqual({ code: "permission", message: "Нет микрофона" });
    });
    act(() => {
      result.current.clearError();
    });
    expect(result.current.error).toBeNull();
  });

  it("ошибка распознавания приходит событием", () => {
    const { result } = renderHook(() => useAutoMode(vi.fn(() => true)));
    emit("auto-mode-error", { code: "network", message: "Нет сети" });
    expect(result.current.error).toEqual({ code: "network", message: "Нет сети" });
  });

  it("не считает реплику отправленной, пока чат занят стримом", () => {
    const onSubmit = vi.fn(() => false);
    renderHook(() => useAutoMode(onSubmit));
    emit("auto-turn", turn(0, "interviewer", "Вопрос?"));
    settle();
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith("Вопрос?");

    onSubmit.mockReturnValue(true);
    emit("auto-turn", turn(1, "interviewer", "И ещё вопрос?"));
    settle();
    expect(onSubmit).toHaveBeenLastCalledWith("Вопрос? И ещё вопрос?");
  });

  it("речь пользователя поверх идущего ответа не запускает вторую отправку", () => {
    const onSubmit = vi.fn(() => true);
    renderHook(() => useAutoMode(onSubmit));
    emit("auto-turn", turn(0, "interviewer", "Что такое GC?"));
    settle();
    expect(onSubmit).toHaveBeenCalledTimes(1);

    emit("auto-turn", turn(1, "user", "Сборщик мусора,"));
    emit("auto-turn", turn(2, "user", "освобождает память."));
    settle();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("следующий вопрос интервьюера отправляется, даже если предыдущий ответ ещё идёт", () => {
    const onSubmit = vi.fn(() => true);
    renderHook(() => useAutoMode(onSubmit));
    emit("auto-turn", turn(0, "interviewer", "Первый?"));
    settle();
    emit("auto-turn", turn(1, "interviewer", "Второй?"));
    settle();
    expect(onSubmit.mock.calls).toEqual([["Первый?"], ["Второй?"]]);
  });

  it("размонтирование гасит отложенную отправку", () => {
    const onSubmit = vi.fn(() => true);
    const { unmount } = renderHook(() => useAutoMode(onSubmit));
    emit("auto-turn", turn(0, "interviewer", "Вопрос?"));
    unmount();
    act(() => {
      vi.advanceTimersByTime(SUBMIT_DEBOUNCE_MS * 3);
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
