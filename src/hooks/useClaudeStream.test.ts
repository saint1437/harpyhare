import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventMap } from "@/ipc/types";

const handlers = new Map<string, (p: unknown) => void>();
const sendToClaude = vi.fn(async (_text: string, _images: unknown[]) => {});
const cancelStream = vi.fn(async () => {});

vi.mock("@/ipc/commands", () => ({
  sendToClaude: (text: string, images: unknown[]) => sendToClaude(text, images),
  cancelStream: () => cancelStream(),
}));
vi.mock("@/ipc/events", () => ({
  onEvent: (name: string, h: (p: unknown) => void) => {
    handlers.set(name, h);
    return () => handlers.delete(name);
  },
}));

function emit<K extends keyof EventMap>(name: K, payload: EventMap[K]): void {
  handlers.get(name)?.(payload);
}

import { useClaudeStream } from "./useClaudeStream";

beforeEach(() => {
  handlers.clear();
  sendToClaude.mockClear();
  cancelStream.mockClear();
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("useClaudeStream", () => {
  it("send запускает стрим и копит дельты до llm-done", async () => {
    const { result } = renderHook(() => useClaudeStream());
    await act(async () => {
      await result.current.send("вопрос", []);
    });
    expect(sendToClaude).toHaveBeenCalledWith("вопрос", []);
    expect(result.current.streaming).toBe(true);
    act(() => emit("llm-delta", "При"));
    act(() => emit("llm-delta", "вет"));
    expect(result.current.answer).toBe("Привет");
    act(() => emit("llm-done", undefined));
    expect(result.current.streaming).toBe(false);
  });

  it("llm-error останавливает стрим и отдаёт ошибку", async () => {
    const { result } = renderHook(() => useClaudeStream());
    await act(async () => {
      await result.current.send("q", []);
    });
    act(() => emit("llm-error", "Anthropic перегружен"));
    expect(result.current.streaming).toBe(false);
    expect(result.current.error).toBe("Anthropic перегружен");
  });

  it("stop отменяет стрим", async () => {
    const { result } = renderHook(() => useClaudeStream());
    await act(async () => {
      await result.current.send("q", []);
    });
    act(() => result.current.stop());
    expect(cancelStream).toHaveBeenCalled();
    expect(result.current.streaming).toBe(false);
  });

  it("повторный send очищает прошлый ответ", async () => {
    const { result } = renderHook(() => useClaudeStream());
    await act(async () => result.current.send("q1", []));
    act(() => emit("llm-delta", "старый"));
    await act(async () => result.current.send("q2", []));
    expect(result.current.answer).toBe("");
    await waitFor(() => expect(result.current.streaming).toBe(true));
  });

  it("запоздалая дельта после stop не меняет ответ", async () => {
    const { result } = renderHook(() => useClaudeStream());
    await act(async () => result.current.send("q", []));
    act(() => emit("llm-delta", "часть"));
    expect(result.current.answer).toBe("часть");
    act(() => result.current.stop());
    act(() => emit("llm-delta", "хвост")); // прилетела после отмены — игнор
    expect(result.current.answer).toBe("часть");
  });
});
