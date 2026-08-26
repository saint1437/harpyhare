import { act, renderHook } from "@testing-library/react";
import { emitIpcEvent, resetIpcEventHandlers } from "@/test-utils/fake-ipc-events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errorTitle } from "@/lib/errors";
import { dismissAllNotifications, getNotifications } from "@/lib/notifications";

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

vi.mock("@/ipc/events", async () => await import("@/test-utils/fake-ipc-events"));
vi.mock("@/ipc/commands", () => ({
  sendToClaude: (...args: unknown[]) => sendToClaude(...args),
  cancelStream: (...args: unknown[]) => {
    cancelStream(...args);
    return cancelResult();
  },
}));

import { useClaudeStream } from "./useClaudeStream";

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
  dismissAllNotifications();
  resetIpcEventHandlers();
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
    emitIpcEvent("llm-delta", { chatId: "A", delta: "при" });
    emitIpcEvent("llm-delta", { chatId: "A", delta: "вет" });
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
    emitIpcEvent("llm-delta", { chatId: "A", delta: "x".repeat(100000) });
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
    emitIpcEvent("llm-delta", { chatId: "A", delta: "AAA" });
    emitIpcEvent("llm-delta", { chatId: "B", delta: "BBB" });
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
    emitIpcEvent("llm-delta", { chatId: "A", delta: "итог" });
    emitIpcEvent("llm-done", { chatId: "A" });
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
    emitIpcEvent("llm-delta", { chatId: "A", delta: "поздно" });
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
    emitIpcEvent("llm-delta", { chatId: "A", delta: "почти готовый ответ" });
    act(() => {
      result.current.stop("A");
    });
    expect(onComplete).toHaveBeenCalledWith("A", "почти готовый ответ");
    expect(result.current.partial["A"]).toBeUndefined();
    emitIpcEvent("llm-done", { chatId: "A" });
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

  it("llm-error сохраняет частичный ответ и показывает уведомление", () => {
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
    emitIpcEvent("llm-delta", { chatId: "A", delta: "начало ответа" });
    emitIpcEvent("llm-error", { chatId: "A", code: "network", message: "оборвалось" });
    expect(onComplete).toHaveBeenCalledWith("A", "начало ответа");
    expect(getNotifications()[0]?.detail).toBe("оборвалось");
    expect(result.current.streaming["A"]).toBeFalsy();
  });

  it("llm-error поднимает уведомление и снимает streaming", () => {
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
    emitIpcEvent("llm-error", { chatId: "A", code: "api", message: "сломалось" });
    expect(getNotifications()[0]?.title).toBe(errorTitle("api"));
    expect(getNotifications()[0]?.detail).toBe("сломалось");
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
    emitIpcEvent("llm-delta", { chatId: "c1", delta: "половина отве" });
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
    emitIpcEvent("llm-delta", { chatId: "c1", delta: "хвост" });
    emitIpcEvent("llm-done", { chatId: "c1" });
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
    emitIpcEvent("llm-delta", { chatId: "c1", delta: "старый ответ" });
    runFrames(3);
    act(() => {
      void result.current.abandon("c1");
    });

    await act(async () => {
      await result.current.send("c1", [], "sys", "m", { thinking: false, webSearch: false });
    });
    emitIpcEvent("llm-delta", { chatId: "c1", delta: "новый" });
    runFrames(5);
    expect(result.current.partial["c1"]).toBe("новый");
    expect(result.current.streaming["c1"]).toBe(true);

    emitIpcEvent("llm-done", { chatId: "c1" });
    expect(onComplete).toHaveBeenCalledExactlyOnceWith("c1", "новый");
  });

  // Отмена — это «попросили сами», и сообщать о ней нечего: `cancelled`
  // единственный код без тона, поэтому уведомления не будет вовсе.
  it("отмена стрима не поднимает уведомления", () => {
    const { result } = renderHook(() => useClaudeStream(vi.fn()));
    act(() => {
      void result.current.send("c1", [], "sys", "m", { thinking: false, webSearch: false });
    });
    emitIpcEvent("llm-error", { chatId: "c1", code: "cancelled", message: "Остановлено" });
    act(() => {
      void result.current.abandon("c1");
    });
    expect(getNotifications()).toHaveLength(0);
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
    emitIpcEvent("llm-delta", { chatId: "c1", delta: "половина" });
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
