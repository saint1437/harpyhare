import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppError } from "@/lib/errors";

type Handler = (payload: unknown) => void;
const handlers = new Map<string, Handler>();
const captureRegionScreenshot = vi.fn<() => Promise<void>>(() => Promise.resolve());

vi.mock("@/ipc/events", () => ({
  onEvent: (name: string, handler: Handler) => {
    handlers.set(name, handler);
    return () => {
      handlers.delete(name);
    };
  },
}));
vi.mock("@/ipc/commands", () => ({
  captureRegionScreenshot: () => captureRegionScreenshot(),
}));

import { useRegionScreenshot } from "./useRegionScreenshot";

function emit(name: string, payload: unknown) {
  act(() => handlers.get(name)?.(payload));
}

const PERMISSION_ERROR: AppError = { code: "permission", message: "Нет разрешения" };

afterEach(() => {
  handlers.clear();
  vi.clearAllMocks();
});

describe("useRegionScreenshot", () => {
  it("собирает data URL из payload события и отдаёт его в колбэк", () => {
    const onImage = vi.fn();
    renderHook(() => useRegionScreenshot(onImage));
    emit("screenshot-ready", { mediaType: "image/png", dataBase64: "iVBORw0K" });
    expect(onImage).toHaveBeenCalledWith("data:image/png;base64,iVBORw0K", "image/png");
  });

  it("ошибка приходит событием и снимается удачным снимком", () => {
    const { result } = renderHook(() => useRegionScreenshot(vi.fn()));
    emit("screenshot-error", PERMISSION_ERROR);
    expect(result.current.error).toEqual(PERMISSION_ERROR);
    emit("screenshot-ready", { mediaType: "image/png", dataBase64: "iVBORw0K" });
    expect(result.current.error).toBeNull();
  });

  it("clearError гасит ошибку, capture дёргает команду", () => {
    const { result } = renderHook(() => useRegionScreenshot(vi.fn()));
    emit("screenshot-error", PERMISSION_ERROR);
    act(() => {
      result.current.clearError();
    });
    expect(result.current.error).toBeNull();
    act(() => {
      result.current.capture();
    });
    expect(captureRegionScreenshot).toHaveBeenCalledTimes(1);
  });
});
