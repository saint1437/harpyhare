import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EventMap } from "@/ipc/types";

const listeners = new Map<string, (payload: unknown) => void>();

vi.mock("@/ipc/events", () => ({
  onEvent: (name: string, handler: (payload: unknown) => void) => {
    listeners.set(name, handler);
    return () => listeners.delete(name);
  },
}));

import { useLlmUsage } from "./useLlmUsage";

afterEach(() => {
  cleanup();
  listeners.clear();
});

describe("useLlmUsage", () => {
  it("хранит input-токены последнего запроса по чатам", () => {
    const { result } = renderHook(() => useLlmUsage());
    const emit = (payload: EventMap["llm-usage"]) => {
      act(() => listeners.get("llm-usage")?.(payload));
    };
    emit({ chatId: "a", inputTokens: 1200 });
    emit({ chatId: "b", inputTokens: 300 });
    emit({ chatId: "a", inputTokens: 2500 });
    expect(result.current).toEqual({ a: 2500, b: 300 });
  });
});
