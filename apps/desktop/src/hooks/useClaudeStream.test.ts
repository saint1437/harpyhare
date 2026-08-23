import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Handler = (payload: unknown) => void;
const handlers = new Map<string, Handler>();
const sendToClaude = vi.fn<(...args: unknown[]) => Promise<void>>();
const cancelStream = vi.fn<(...args: unknown[]) => void>();
let cancelOutcome: "resolved" | "deferred" | "rejected" = "resolved";
let releaseCancel: (() => void) | null = null;

function cancelResult(): Promise<void> {
  if (cancelOutcome === "rejected") return Promise.reject(new Error("ipc down"));
  if (cancelOutcome === "resolved") return Promise.resolve();
  return new Promise<void>((resolve) => {
    releaseCancel = resolve;
  });
}

vi.mock("@/ipc/events", () => ({
  onEvent: (name: string, handler: Handler) => {
    handlers.set(name, handler);
    return () => {
      handlers.delete(name);
    };
  },
}));
vi.mock("@/ipc/commands", () => ({
  sendToClaude: (...args: unknown[]) => sendToClaude(...args),
  cancelStream: (...args: unknown[]) => {
    cancelStream(...args);
    return cancelResult();
  },
}));

import { useClaudeStream } from "./useClaudeStream";

function emit(name: string, payload: unknown) {
  act(() => handlers.get(name)?.(payload));
}

let frameCallbacks: FrameRequestCallback[] = [];
let frameNow = 0;
const FRAME_DT_MS = 400;

function runFrames(count: number, dtMs = FRAME_DT_MS) {
  for (let i = 0; i < count; i += 1) {
    const callbacks = frameCallbacks;
    frameCallbacks = [];
    frameNow += dtMs;
    act(() => {
      for (const cb of callbacks) cb(frameNow);
    });
  }
}

beforeEach(() => {
  cancelOutcome = "resolved";
  releaseCancel = null;
  frameCallbacks = [];
  frameNow = 0;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    frameCallbacks.push(cb);
    return frameCallbacks.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
});
afterEach(() => {
  handlers.clear();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("useClaudeStream (per-chat)", () => {
  it("роутит дельты в нужный чат", () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => useClaudeStream(onComplete));
    act(
      () =>
        void result.current.send(
          "A",
          [{ role: "user", text: "q", images: [] }],
          "",
          "claude-opus-4-8",
          { thinking: true, webSearch: false },
        ),
    );
    emit("llm-delta", { chatId: "A", delta: "при" });
    emit("llm-delta", { chatId: "A", delta: "вет" });
    runFrames(2);
    expect(result.current.partial["A"]).toBe("привет");
    expect(result.current.streaming["A"]).toBe(true);
  });

  it("раскрывает буфер постепенно, а не разом", () => {
    const { result } = renderHook(() => useClaudeStream(vi.fn()));
    act(
      () =>
        void result.current.send(
          "A",
          [{ role: "user", text: "q", images: [] }],
          "",
          "claude-opus-4-8",
          { thinking: true, webSearch: false },
        ),
    );
    emit("llm-delta", { chatId: "A", delta: "x".repeat(100000) });
    runFrames(2, 50);
    const shown = result.current.partial["A"] ?? "";
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.length).toBeLessThan(100000);
  });

  it("два параллельных стрима не смешиваются", () => {
    const { result } = renderHook(() => useClaudeStream(vi.fn()));
    act(
      () =>
        void result.current.send(
          "A",
          [{ role: "user", text: "q", images: [] }],
          "",
          "claude-opus-4-8",
          { thinking: true, webSearch: false },
        ),
    );
    act(
      () =>
        void result.current.send(
          "B",
          [{ role: "user", text: "q", images: [] }],
          "",
          "claude-opus-4-8",
          { thinking: true, webSearch: false },
        ),
    );
    emit("llm-delta", { chatId: "A", delta: "AAA" });
    emit("llm-delta", { chatId: "B", delta: "BBB" });
    runFrames(2);
    expect(result.current.partial["A"]).toBe("AAA");
    expect(result.current.partial["B"]).toBe("BBB");
  });

  it("llm-done вызывает onComplete с полным текстом и снимает streaming", () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => useClaudeStream(onComplete));
    act(
      () =>
        void result.current.send(
          "A",
          [{ role: "user", text: "q", images: [] }],
          "",
          "claude-opus-4-8",
          { thinking: true, webSearch: false },
        ),
    );
    emit("llm-delta", { chatId: "A", delta: "итог" });
    emit("llm-done", { chatId: "A" });
    expect(onComplete).toHaveBeenCalledWith("A", "итог");
    expect(result.current.streaming["A"]).toBeFalsy();
    expect(result.current.partial["A"]).toBeUndefined();
  });

  it("после stop поздние дельты игнорируются", () => {
    const { result } = renderHook(() => useClaudeStream(vi.fn()));
    act(
      () =>
        void result.current.send(
          "A",
          [{ role: "user", text: "q", images: [] }],
          "",
          "claude-opus-4-8",
          { thinking: true, webSearch: false },
        ),
    );
    act(() => {
      result.current.stop("A");
    });
    expect(cancelStream).toHaveBeenCalledWith("A");
    emit("llm-delta", { chatId: "A", delta: "поздно" });
    expect(result.current.partial["A"]).toBeUndefined();
  });

  it("stop сохраняет частичный ответ через onComplete (не выбрасывает)", () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => useClaudeStream(onComplete));
    act(
      () =>
        void result.current.send(
          "A",
          [{ role: "user", text: "q", images: [] }],
          "",
          "claude-opus-4-8",
          { thinking: true, webSearch: false },
        ),
    );
    emit("llm-delta", { chatId: "A", delta: "почти готовый ответ" });
    act(() => {
      result.current.stop("A");
    });
    expect(onComplete).toHaveBeenCalledWith("A", "почти готовый ответ");
    expect(result.current.partial["A"]).toBeUndefined();
    emit("llm-done", { chatId: "A" });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("stop без полученного текста не трогает onComplete", () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => useClaudeStream(onComplete));
    act(
      () =>
        void result.current.send(
          "A",
          [{ role: "user", text: "q", images: [] }],
          "",
          "claude-opus-4-8",
          { thinking: true, webSearch: false },
        ),
    );
    act(() => {
      result.current.stop("A");
    });
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("llm-error сохраняет частичный ответ и показывает ошибку", () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => useClaudeStream(onComplete));
    act(
      () =>
        void result.current.send(
          "A",
          [{ role: "user", text: "q", images: [] }],
          "",
          "claude-opus-4-8",
          { thinking: true, webSearch: false },
        ),
    );
    emit("llm-delta", { chatId: "A", delta: "начало ответа" });
    emit("llm-error", { chatId: "A", code: "network", message: "оборвалось" });
    expect(onComplete).toHaveBeenCalledWith("A", "начало ответа");
    expect(result.current.error["A"]).toEqual({ code: "network", message: "оборвалось" });
    expect(result.current.streaming["A"]).toBeFalsy();
  });

  it("llm-error кладёт ошибку в чат и снимает streaming", () => {
    const { result } = renderHook(() => useClaudeStream(vi.fn()));
    act(
      () =>
        void result.current.send(
          "A",
          [{ role: "user", text: "q", images: [] }],
          "",
          "claude-opus-4-8",
          { thinking: true, webSearch: false },
        ),
    );
    emit("llm-error", { chatId: "A", code: "api", message: "сломалось" });
    expect(result.current.error["A"]).toEqual({ code: "api", message: "сломалось" });
    expect(result.current.streaming["A"]).toBeFalsy();
  });
});

describe("useClaudeStream — barge-in (abandon)", () => {
  it("сбрасывает стрим без записи недоговорённого ответа в историю", async () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => useClaudeStream(onComplete));
    await act(async () => {
      await result.current.send("c1", [], "sys", "m", { thinking: false, webSearch: false });
    });
    emit("llm-delta", { chatId: "c1", delta: "половина отве" });
    runFrames(3);
    expect(result.current.streaming["c1"]).toBe(true);

    act(() => {
      void result.current.abandon("c1");
    });
    expect(cancelStream).toHaveBeenCalledWith("c1");
    expect(onComplete).not.toHaveBeenCalled();
    expect(result.current.streaming["c1"]).toBe(false);
    expect(result.current.partial["c1"]).toBeUndefined();
  });

  it("поздние события отменённого стрима не оживляют его", () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => useClaudeStream(onComplete));
    act(() => {
      void result.current.send("c1", [], "sys", "m", { thinking: false, webSearch: false });
    });
    act(() => {
      void result.current.abandon("c1");
    });
    emit("llm-delta", { chatId: "c1", delta: "хвост" });
    emit("llm-done", { chatId: "c1" });
    runFrames(2);
    expect(onComplete).not.toHaveBeenCalled();
    expect(result.current.streaming["c1"]).toBe(false);
    expect(result.current.partial["c1"]).toBeUndefined();
  });

  it("новый стрим после сброса начинается с чистого буфера", async () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => useClaudeStream(onComplete));
    await act(async () => {
      await result.current.send("c1", [], "sys", "m", { thinking: false, webSearch: false });
    });
    emit("llm-delta", { chatId: "c1", delta: "старый ответ" });
    runFrames(3);
    act(() => {
      void result.current.abandon("c1");
    });

    await act(async () => {
      await result.current.send("c1", [], "sys", "m", { thinking: false, webSearch: false });
    });
    emit("llm-delta", { chatId: "c1", delta: "новый" });
    runFrames(5);
    expect(result.current.partial["c1"]).toBe("новый");
    expect(result.current.streaming["c1"]).toBe(true);

    emit("llm-done", { chatId: "c1" });
    expect(onComplete).toHaveBeenCalledExactlyOnceWith("c1", "новый");
  });

  it("сброшенный стрим не оставляет ошибку на чате", () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => useClaudeStream(onComplete));
    act(() => {
      void result.current.send("c1", [], "sys", "m", { thinking: false, webSearch: false });
    });
    emit("llm-error", { chatId: "c1", code: "api", message: "боль" });
    act(() => {
      void result.current.send("c1", [], "sys", "m", { thinking: false, webSearch: false });
    });
    act(() => {
      void result.current.abandon("c1");
    });
    expect(result.current.error["c1"]).toBeNull();
  });
});

const REQUEST = ["sys", "m", { thinking: false, webSearch: false }] as const;

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("useClaudeStream — отмена завершается до нового запроса", () => {
  it("новый запрос не уходит, пока отмена старого не завершилась", async () => {
    const { result } = renderHook(() => useClaudeStream(vi.fn()));
    await act(async () => {
      await result.current.send("c1", [], ...REQUEST);
    });
    expect(sendToClaude).toHaveBeenCalledTimes(1);

    cancelOutcome = "deferred";
    act(() => {
      void result.current.abandon("c1");
    });
    expect(cancelStream).toHaveBeenCalledExactlyOnceWith("c1");

    act(() => {
      void result.current.send("c1", [], ...REQUEST);
    });
    await flushMicrotasks();
    expect(sendToClaude).toHaveBeenCalledTimes(1);
    expect(result.current.streaming["c1"]).toBe(false);

    await act(async () => {
      releaseCancel?.();
      await Promise.resolve();
    });
    await flushMicrotasks();
    expect(sendToClaude).toHaveBeenCalledTimes(2);
    expect(result.current.streaming["c1"]).toBe(true);
  });

  it("состояние чата сбрасывается сразу, не дожидаясь бэкенда", async () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => useClaudeStream(onComplete));
    await act(async () => {
      await result.current.send("c1", [], ...REQUEST);
    });
    emit("llm-delta", { chatId: "c1", delta: "половина" });
    runFrames(3);

    cancelOutcome = "deferred";
    act(() => {
      void result.current.abandon("c1");
    });
    expect(result.current.streaming["c1"]).toBe(false);
    expect(result.current.partial["c1"]).toBeUndefined();
    expect(onComplete).not.toHaveBeenCalled();

    await act(async () => {
      releaseCancel?.();
      await Promise.resolve();
    });
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("сбой отмены не блокирует следующий запрос и не всплывает наружу", async () => {
    const { result } = renderHook(() => useClaudeStream(vi.fn()));
    cancelOutcome = "rejected";
    await act(async () => {
      await result.current.abandon("c1");
    });
    cancelOutcome = "resolved";

    await act(async () => {
      await result.current.send("c1", [], ...REQUEST);
    });
    expect(sendToClaude).toHaveBeenCalledTimes(1);
    expect(result.current.streaming["c1"]).toBe(true);
  });

  it("отмена одного чата не задерживает запрос в другом", async () => {
    const { result } = renderHook(() => useClaudeStream(vi.fn()));
    cancelOutcome = "deferred";
    act(() => {
      void result.current.abandon("c1");
    });

    await act(async () => {
      await result.current.send("c2", [], ...REQUEST);
    });
    expect(sendToClaude).toHaveBeenCalledTimes(1);
    expect(result.current.streaming["c2"]).toBe(true);
  });

  it("после завершённой отмены следующий запрос уходит без ожидания", async () => {
    const { result } = renderHook(() => useClaudeStream(vi.fn()));
    await act(async () => {
      await result.current.abandon("c1");
    });
    await act(async () => {
      await result.current.send("c1", [], ...REQUEST);
    });
    expect(sendToClaude).toHaveBeenCalledTimes(1);
  });
});
