import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LogicalWindowSize } from "@/ipc/events";
import { PREVIEW_EXTRA_WIDTH_PX } from "@/lib/shell-layout";

const collapseMainWindow = vi.fn(() => Promise.resolve());
const expandMainWindow = vi.fn<(width: number, height: number) => Promise<void>>(() =>
  Promise.resolve(),
);
const setWindowSize = vi.fn<(width: number, height: number) => Promise<void>>(() =>
  Promise.resolve(),
);
let resize: ((size: LogicalWindowSize) => void) | undefined;

vi.mock("@/ipc/commands", () => ({
  collapseMainWindow: () => collapseMainWindow(),
  expandMainWindow: (width: number, height: number) => expandMainWindow(width, height),
  setWindowSize: (width: number, height: number) => setWindowSize(width, height),
}));
vi.mock("@/ipc/events", () => ({
  onWindowResized: (handler: (size: LogicalWindowSize) => void) => {
    resize = handler;
    return () => {
      resize = undefined;
    };
  },
}));

import { useWindowFrame, type WindowFrameInput } from "./useWindowFrame";

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function frameInput(overrides: Partial<WindowFrameInput> = {}): WindowFrameInput {
  return {
    windowWidth: 960,
    windowHeight: 680,
    previewOpen: false,
    miniMode: false,
    ready: true,
    applyNativeWindowSize: vi.fn(),
    ...overrides,
  };
}

describe("useWindowFrame — восстановление HUD", () => {
  it("не применяет дефолты и не сохраняет размеры до загрузки настроек", () => {
    const input = frameInput({ ready: false });
    const { rerender } = renderHook(
      (props) => {
        useWindowFrame(props);
      },
      { initialProps: input },
    );
    act(() => resize?.({ width: 168, height: 48 }));
    expect(input.applyNativeWindowSize).not.toHaveBeenCalled();
    expect(setWindowSize).not.toHaveBeenCalled();
    rerender({ ...input, ready: true });
    expect(setWindowSize).toHaveBeenCalledWith(960, 680);
  });

  it("повторные F12 возвращают сохранённый размер, а не размеры мини-окна", () => {
    const input = frameInput();
    const { rerender } = renderHook(
      (props) => {
        useWindowFrame(props);
      },
      { initialProps: input },
    );
    for (let cycle = 0; cycle < 3; cycle++) {
      rerender({ ...input, miniMode: true });
      act(() => {
        resize?.({ width: 168, height: 48 });
        vi.advanceTimersByTime(1000);
      });
      rerender(input);
      act(() => {
        resize?.({ width: 400, height: 300 });
        resize?.({ width: 960, height: 680 });
        vi.advanceTimersByTime(700);
      });
    }
    expect(collapseMainWindow).toHaveBeenCalledTimes(3);
    expect(expandMainWindow.mock.calls).toEqual([
      [960, 680],
      [960, 680],
      [960, 680],
    ]);
    expect(input.applyNativeWindowSize).not.toHaveBeenCalled();
  });

  it("восстанавливает общую ширину с открытым превью", () => {
    const input = frameInput({ previewOpen: true });
    const { rerender } = renderHook(
      (props) => {
        useWindowFrame(props);
      },
      { initialProps: input },
    );
    rerender({ ...input, miniMode: true });
    rerender(input);
    expect(expandMainWindow).toHaveBeenCalledWith(960 + PREVIEW_EXTRA_WIDTH_PX, 680);
  });

  it("изменённые в мини-режиме настройки применяются при разворачивании", () => {
    const input = frameInput();
    const { rerender } = renderHook(
      (props) => {
        useWindowFrame(props);
      },
      { initialProps: input },
    );
    rerender({ ...input, miniMode: true });
    rerender({ ...input, miniMode: true, windowWidth: 1100, windowHeight: 800 });
    rerender({ ...input, windowWidth: 1100, windowHeight: 800 });
    expect(expandMainWindow).toHaveBeenCalledWith(1100, 800);
  });

  it("кадр мышиного ресайза, отложенный перед F12, не перезаписывает размер HUD", () => {
    const input = frameInput();
    const { rerender } = renderHook(
      (props) => {
        useWindowFrame(props);
      },
      { initialProps: input },
    );
    act(() => {
      vi.advanceTimersByTime(700);
      resize?.({ width: 1000, height: 720 });
    });
    rerender({ ...input, miniMode: true });
    rerender(input);
    act(() => {
      resize?.({ width: 400, height: 300 });
      vi.advanceTimersByTime(20);
    });
    expect(input.applyNativeWindowSize).not.toHaveBeenCalled();
  });

  it("после восстановления ручной ресайз снова сохраняется без эхо-твина", () => {
    const input = frameInput();
    const { rerender } = renderHook(
      (props) => {
        useWindowFrame(props);
      },
      { initialProps: input },
    );
    rerender({ ...input, miniMode: true });
    rerender(input);
    act(() => {
      vi.advanceTimersByTime(700);
      resize?.({ width: 1000, height: 720 });
      vi.advanceTimersByTime(20);
    });
    expect(input.applyNativeWindowSize).toHaveBeenCalledWith(1000, 720);
    setWindowSize.mockClear();
    rerender({ ...input, windowWidth: 1000, windowHeight: 720 });
    expect(setWindowSize).not.toHaveBeenCalled();
  });
});
