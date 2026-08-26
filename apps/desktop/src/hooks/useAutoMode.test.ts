import { act, renderHook, waitFor } from "@testing-library/react";
import { emitIpcEvent, resetIpcEventHandlers } from "@/test-utils/fake-ipc-events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AutoTurn } from "@/ipc/types";
import { errorTitle } from "@/lib/errors";
import { dismissAllNotifications, getNotifications } from "@/lib/notifications";

const startAutoMode = vi.fn<() => Promise<null>>(() => Promise.resolve(null));
const stopAutoMode = vi.fn<() => Promise<void>>(() => Promise.resolve());
const autoModeActive = vi.fn<() => Promise<boolean>>(() => Promise.resolve(false));
const takeAutoModeError = vi.fn<() => Promise<{ code: string; message: string } | null>>(() =>
  Promise.resolve(null),
);

vi.mock("@/ipc/events", async () => await import("@/test-utils/fake-ipc-events"));
vi.mock("@/ipc/commands", () => ({
  startAutoMode: () => startAutoMode(),
  stopAutoMode: () => stopAutoMode(),
  autoModeActive: () => autoModeActive(),
  takeAutoModeError: () => takeAutoModeError(),
}));

import { useAutoMode } from "./useAutoMode";

const SUBMIT_DEBOUNCE_MS = 900;
const INSTANT = true;
const MANUAL = false;

function turn(seq: number, speaker: AutoTurn["speaker"], text: string): AutoTurn {
  return { seq, speaker, text };
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
  dismissAllNotifications();
  vi.useRealTimers();
  resetIpcEventHandlers();
  vi.clearAllMocks();
});

describe("useAutoMode — мгновенный режим", () => {
  it("копит реплики по порядку независимо от порядка прихода", () => {
    const { result } = renderHook(() =>
      useAutoMode(
        vi.fn(() => true),
        INSTANT,
      ),
    );
    emitIpcEvent("auto-turn", turn(1, "user", "второй"));
    emitIpcEvent("auto-turn", turn(0, "interviewer", "первый"));
    expect(result.current.turns.map((t) => t.seq)).toEqual([0, 1]);
  });

  it("отправляет вопрос интервьюера после паузы", () => {
    const onSubmit = vi.fn(() => true);
    renderHook(() => useAutoMode(onSubmit, INSTANT));
    emitIpcEvent("auto-turn", turn(0, "interviewer", "Что такое GC?"));
    expect(onSubmit).not.toHaveBeenCalled();
    settle();
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith("Что такое GC?");
  });

  it("склеивает разорванный вопрос в одну отправку", () => {
    const onSubmit = vi.fn(() => true);
    renderHook(() => useAutoMode(onSubmit, INSTANT));
    emitIpcEvent("auto-turn", turn(0, "interviewer", "Что такое"));
    act(() => {
      vi.advanceTimersByTime(SUBMIT_DEBOUNCE_MS / 2);
    });
    emitIpcEvent("auto-turn", turn(1, "interviewer", "сборка мусора?"));
    settle();
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith("Что такое сборка мусора?");
  });

  it("не отправляет речь пользователя саму по себе", () => {
    const onSubmit = vi.fn(() => true);
    renderHook(() => useAutoMode(onSubmit, INSTANT));
    emitIpcEvent("auto-turn", turn(0, "user", "Думаю вслух."));
    settle();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("прикладывает ответ пользователя к следующему вопросу и не повторяет отправленное", () => {
    const onSubmit = vi.fn(() => true);
    renderHook(() => useAutoMode(onSubmit, INSTANT));
    emitIpcEvent("auto-turn", turn(0, "interviewer", "Что такое GC?"));
    settle();
    emitIpcEvent("auto-turn", turn(1, "user", "Сборщик мусора."));
    settle();
    emitIpcEvent("auto-turn", turn(2, "interviewer", "А какие бывают?"));
    settle();
    expect(onSubmit.mock.calls).toEqual([
      ["Что такое GC?"],
      ["Я: Сборщик мусора.\nИнтервьюер: А какие бывают?"],
    ]);
  });

  it("повтор той же реплики не даёт второй отправки", () => {
    const onSubmit = vi.fn(() => true);
    renderHook(() => useAutoMode(onSubmit, INSTANT));
    emitIpcEvent("auto-turn", turn(0, "interviewer", "Вопрос?"));
    settle();
    emitIpcEvent("auto-turn", turn(0, "interviewer", "Вопрос?"));
    settle();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("выключение режима чистит накопленное, и следующая сессия начинается с нуля", () => {
    const onSubmit = vi.fn(() => true);
    const { result } = renderHook(() => useAutoMode(onSubmit, INSTANT));
    emitIpcEvent("auto-mode-changed", { active: true });
    emitIpcEvent("auto-turn", turn(7, "interviewer", "Старый вопрос?"));
    emitIpcEvent("auto-mode-changed", { active: false });
    expect(result.current.active).toBe(false);
    expect(result.current.turns).toEqual([]);
    settle();
    expect(onSubmit).not.toHaveBeenCalled();

    emitIpcEvent("auto-mode-changed", { active: true });
    emitIpcEvent("auto-turn", turn(0, "interviewer", "Новый вопрос?"));
    settle();
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith("Новый вопрос?");
  });

  it("тумблер стартует и останавливает потоки на бэкенде", async () => {
    const { result } = renderHook(() =>
      useAutoMode(
        vi.fn(() => true),
        INSTANT,
      ),
    );
    act(() => {
      result.current.toggle();
    });
    expect(startAutoMode).toHaveBeenCalledTimes(1);

    emitIpcEvent("auto-mode-changed", { active: true });
    await waitFor(() => {
      expect(result.current.active).toBe(true);
    });
    act(() => {
      result.current.toggle();
    });
    expect(stopAutoMode).toHaveBeenCalledTimes(1);
  });

  // Хук больше не держит отказ у себя: заголовок берётся из кода, текст из
  // сообщения, и всё это живёт в уведомлении.
  it("ошибка старта, случившаяся до подписки на события, забирается при маунте", async () => {
    // swap_to_main_window starts auto mode before the webview subscribes, so a
    // fast failure is stored in Rust and pulled with a command on mount.
    takeAutoModeError.mockResolvedValueOnce({ code: "permission", message: "Нет микрофона" });
    renderHook(() =>
      useAutoMode(
        vi.fn(() => true),
        INSTANT,
      ),
    );
    await waitFor(() => {
      expect(getNotifications()).toHaveLength(1);
    });
    expect(getNotifications()[0]?.title).toBe(errorTitle("permission"));
    expect(getNotifications()[0]?.detail).toBe("Нет микрофона");
  });

  it("отказ старта уходит в уведомление заголовком по коду", async () => {
    startAutoMode.mockRejectedValueOnce({ code: "permission", message: "Нет микрофона" });
    const { result } = renderHook(() =>
      useAutoMode(
        vi.fn(() => true),
        INSTANT,
      ),
    );
    act(() => {
      result.current.toggle();
    });
    await waitFor(() => {
      expect(getNotifications()).toHaveLength(1);
    });
    expect(getNotifications()[0]?.title).toBe(errorTitle("permission"));
    expect(getNotifications()[0]?.detail).toBe("Нет микрофона");
  });

  it("ошибка распознавания приходит событием и получает тон предупреждения", () => {
    renderHook(() =>
      useAutoMode(
        vi.fn(() => true),
        INSTANT,
      ),
    );
    emitIpcEvent("auto-mode-error", { code: "network", message: "Нет сети" });
    expect(getNotifications()[0]?.title).toBe(errorTitle("network"));
    expect(getNotifications()[0]?.tone).toBe("warning");
  });

  it("не считает реплику отправленной, пока чат занят стримом", () => {
    const onSubmit = vi.fn(() => false);
    renderHook(() => useAutoMode(onSubmit, INSTANT));
    emitIpcEvent("auto-turn", turn(0, "interviewer", "Вопрос?"));
    settle();
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith("Вопрос?");

    onSubmit.mockReturnValue(true);
    emitIpcEvent("auto-turn", turn(1, "interviewer", "И ещё вопрос?"));
    settle();
    expect(onSubmit).toHaveBeenLastCalledWith("Вопрос? И ещё вопрос?");
  });

  it("речь пользователя поверх идущего ответа не запускает вторую отправку", () => {
    const onSubmit = vi.fn(() => true);
    renderHook(() => useAutoMode(onSubmit, INSTANT));
    emitIpcEvent("auto-turn", turn(0, "interviewer", "Что такое GC?"));
    settle();
    expect(onSubmit).toHaveBeenCalledTimes(1);

    emitIpcEvent("auto-turn", turn(1, "user", "Сборщик мусора,"));
    emitIpcEvent("auto-turn", turn(2, "user", "освобождает память."));
    settle();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("следующий вопрос интервьюера отправляется, даже если предыдущий ответ ещё идёт", () => {
    const onSubmit = vi.fn(() => true);
    renderHook(() => useAutoMode(onSubmit, INSTANT));
    emitIpcEvent("auto-turn", turn(0, "interviewer", "Первый?"));
    settle();
    emitIpcEvent("auto-turn", turn(1, "interviewer", "Второй?"));
    settle();
    expect(onSubmit.mock.calls).toEqual([["Первый?"], ["Второй?"]]);
  });

  it("размонтирование гасит отложенную отправку", () => {
    const onSubmit = vi.fn(() => true);
    const { unmount } = renderHook(() => useAutoMode(onSubmit, INSTANT));
    emitIpcEvent("auto-turn", turn(0, "interviewer", "Вопрос?"));
    unmount();
    act(() => {
      vi.advanceTimersByTime(SUBMIT_DEBOUNCE_MS * 3);
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("useAutoMode — ручной режим", () => {
  it("реплики копятся, но сами в чат не уходят", () => {
    const onSubmit = vi.fn(() => true);
    const { result } = renderHook(() => useAutoMode(onSubmit, MANUAL));
    emitIpcEvent("auto-turn", turn(0, "interviewer", "Что такое GC?"));
    settle();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(result.current.pending.map((t) => t.seq)).toEqual([0]);
  });

  it("ответ по кнопке отправляет всё услышанное, включая собственную речь", () => {
    const onSubmit = vi.fn(() => true);
    const { result } = renderHook(() => useAutoMode(onSubmit, MANUAL));
    emitIpcEvent("auto-turn", turn(0, "interviewer", "Что такое GC?"));
    emitIpcEvent("auto-turn", turn(1, "user", "Сборщик мусора."));
    act(() => {
      result.current.answer();
    });
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith(
      "Интервьюер: Что такое GC?\nЯ: Сборщик мусора.",
    );
    expect(result.current.pending).toEqual([]);
  });

  it("своя реплика последней не мешает ответить — в мгновенном режиме она бы отправку не запустила", () => {
    const onSubmit = vi.fn(() => true);
    const { result } = renderHook(() => useAutoMode(onSubmit, MANUAL));
    emitIpcEvent("auto-turn", turn(0, "user", "Я всё сказал."));
    act(() => {
      result.current.answer();
    });
    // Разметка остаётся: без метки модель приняла бы мою же реплику за вопрос.
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith("Я: Я всё сказал.");
  });

  it("глобальный хоткей ответа делает то же, что кнопка", () => {
    const onSubmit = vi.fn(() => true);
    renderHook(() => useAutoMode(onSubmit, MANUAL));
    emitIpcEvent("auto-turn", turn(0, "interviewer", "Вопрос?"));
    emitIpcEvent("auto-answer", null);
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith("Вопрос?");
  });

  it("отправленное не уходит вторым разом", () => {
    const onSubmit = vi.fn(() => true);
    const { result } = renderHook(() => useAutoMode(onSubmit, MANUAL));
    emitIpcEvent("auto-turn", turn(0, "interviewer", "Вопрос?"));
    act(() => {
      result.current.answer();
    });
    act(() => {
      result.current.answer();
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("занятый стримом чат не съедает реплику: она уходит следующим ответом", () => {
    const onSubmit = vi.fn(() => false);
    const { result } = renderHook(() => useAutoMode(onSubmit, MANUAL));
    emitIpcEvent("auto-turn", turn(0, "interviewer", "Вопрос?"));
    act(() => {
      result.current.answer();
    });
    expect(result.current.pending.map((t) => t.seq)).toEqual([0]);

    onSubmit.mockReturnValue(true);
    act(() => {
      result.current.answer();
    });
    expect(onSubmit).toHaveBeenLastCalledWith("Вопрос?");
    expect(result.current.pending).toEqual([]);
  });

  it("пустая очередь — ответ ничего не отправляет", () => {
    const onSubmit = vi.fn(() => true);
    const { result } = renderHook(() => useAutoMode(onSubmit, MANUAL));
    act(() => {
      result.current.answer();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
