import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Handler = (payload: unknown) => void;
const handlers: Record<string, Handler> = {};
const sendToClaude = vi.fn();
const cancelStream = vi.fn();

vi.mock("@/ipc/events", () => ({
  onEvent: (name: string, handler: Handler) => {
    handlers[name] = handler;
    return () => delete handlers[name];
  },
}));
vi.mock("@/ipc/commands", () => ({
  sendToClaude: (...args: unknown[]) => sendToClaude(...args),
  cancelStream: (...args: unknown[]) => cancelStream(...args),
}));

import { useClaudeStream } from "./useClaudeStream";

function emit(name: string, payload: unknown) {
  act(() => handlers[name]?.(payload));
}

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
});
afterEach(() => {
  for (const k of Object.keys(handlers)) delete handlers[k];
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("useClaudeStream (per-chat)", () => {
  it("роутит дельты в нужный чат", () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => useClaudeStream(onComplete));
    act(() => void result.current.send("A", [{ role: "user", text: "q", images: [] }]));
    emit("llm-delta", { chatId: "A", delta: "при" });
    emit("llm-delta", { chatId: "A", delta: "вет" });
    expect(result.current.partial["A"]).toBe("привет");
    expect(result.current.streaming["A"]).toBe(true);
  });

  it("два параллельных стрима не смешиваются", () => {
    const { result } = renderHook(() => useClaudeStream(vi.fn()));
    act(() => void result.current.send("A", [{ role: "user", text: "q", images: [] }]));
    act(() => void result.current.send("B", [{ role: "user", text: "q", images: [] }]));
    emit("llm-delta", { chatId: "A", delta: "AAA" });
    emit("llm-delta", { chatId: "B", delta: "BBB" });
    expect(result.current.partial["A"]).toBe("AAA");
    expect(result.current.partial["B"]).toBe("BBB");
  });

  it("llm-done вызывает onComplete с полным текстом и снимает streaming", () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => useClaudeStream(onComplete));
    act(() => void result.current.send("A", [{ role: "user", text: "q", images: [] }]));
    emit("llm-delta", { chatId: "A", delta: "итог" });
    emit("llm-done", { chatId: "A" });
    expect(onComplete).toHaveBeenCalledWith("A", "итог");
    expect(result.current.streaming["A"]).toBeFalsy();
    expect(result.current.partial["A"]).toBeUndefined();
  });

  it("после stop поздние дельты игнорируются", () => {
    const { result } = renderHook(() => useClaudeStream(vi.fn()));
    act(() => void result.current.send("A", [{ role: "user", text: "q", images: [] }]));
    act(() => result.current.stop("A"));
    expect(cancelStream).toHaveBeenCalledWith("A");
    emit("llm-delta", { chatId: "A", delta: "поздно" });
    expect(result.current.partial["A"]).toBeUndefined();
  });

  it("llm-error кладёт ошибку в чат и снимает streaming", () => {
    const { result } = renderHook(() => useClaudeStream(vi.fn()));
    act(() => void result.current.send("A", [{ role: "user", text: "q", images: [] }]));
    emit("llm-error", { chatId: "A", message: "сломалось" });
    expect(result.current.error["A"]).toBe("сломалось");
    expect(result.current.streaming["A"]).toBeFalsy();
  });
});
