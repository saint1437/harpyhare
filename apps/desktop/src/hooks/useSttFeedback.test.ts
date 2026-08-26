import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RecorderState } from "@/ipc/types";
import type { AppError } from "@/lib/errors";

const retryTranscription = vi.fn(() => Promise.resolve());
const notifyAppError = vi.fn<(error: AppError) => void>();

vi.mock("@/ipc/commands", () => ({
  retryTranscription: (): Promise<void> => retryTranscription(),
}));
vi.mock("@/ipc/events", async () => await import("@/test-utils/fake-ipc-events"));
vi.mock("@/lib/notifications", async (orig) => {
  const real = await orig<typeof import("@/lib/notifications")>();
  return {
    ...real,
    notifyAppError: (e: AppError): void => {
      notifyAppError(e);
    },
  };
});

import { emitIpcEvent, resetIpcEventHandlers } from "@/test-utils/fake-ipc-events";
import { useSttFeedback } from "./useSttFeedback";

const RETRYABLE: AppError = { code: "retryable", message: "перегружен" };
const FATAL: AppError = { code: "badApiKey", message: "ключ не подошёл" };

beforeEach(() => {
  retryTranscription.mockClear();
  notifyAppError.mockClear();
});

afterEach(resetIpcEventHandlers);

describe("useSttFeedback", () => {
  it("отказ уходит в уведомление, а кнопка «Повторить» остаётся на месте", () => {
    const { result } = renderHook(() => useSttFeedback("idle"));
    emitIpcEvent("stt-error", RETRYABLE);
    expect(notifyAppError).toHaveBeenCalledWith(RETRYABLE);
    expect(result.current.showRetry).toBe(true);
  });

  it("неповторяемый отказ кнопку не показывает", () => {
    const { result } = renderHook(() => useSttFeedback("idle"));
    emitIpcEvent("stt-error", FATAL);
    expect(notifyAppError).toHaveBeenCalledWith(FATAL);
    expect(result.current.showRetry).toBe(false);
  });

  it("новая запись снимает кнопку", () => {
    const { result, rerender } = renderHook(({ state }) => useSttFeedback(state), {
      initialProps: { state: "idle" as RecorderState },
    });
    emitIpcEvent("stt-error", RETRYABLE);
    expect(result.current.showRetry).toBe(true);
    rerender({ state: "recording" });
    expect(result.current.showRetry).toBe(false);
  });

  it("retry скрывает кнопку и просит бэкенд повторить", () => {
    const { result } = renderHook(() => useSttFeedback("idle"));
    emitIpcEvent("stt-error", RETRYABLE);
    act(() => {
      result.current.retry();
    });
    expect(retryTranscription).toHaveBeenCalledTimes(1);
    expect(result.current.showRetry).toBe(false);
  });

  it("clearFeedback снимает кнопку без запроса", () => {
    const { result } = renderHook(() => useSttFeedback("idle"));
    emitIpcEvent("stt-error", RETRYABLE);
    act(() => {
      result.current.clearFeedback();
    });
    expect(result.current.showRetry).toBe(false);
    expect(retryTranscription).not.toHaveBeenCalled();
  });
});
