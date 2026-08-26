import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LogicalWindowSize } from "@/ipc/events";
import { PREVIEW_EXTRA_WIDTH_PX } from "@/lib/shell-layout";

const setWindowSize = vi.fn((_width: number, _height: number) => Promise.resolve());
let resizeHandler: ((size: LogicalWindowSize) => void) | null = null;

vi.mock("@/ipc/commands", () => ({
  setWindowSize: (w: number, h: number) => setWindowSize(w, h),
}));
vi.mock("@/ipc/events", () => ({
  onWindowResized: (handler: (size: LogicalWindowSize) => void) => {
    resizeHandler = handler;
    return () => {
      resizeHandler = null;
    };
  },
}));

import { useNativeResizeSync, useWindowFrameSync } from "./useWindowFrameSync";

const NO_NATIVE_SIZE: LogicalWindowSize = { width: 0, height: 0 };

function refs(native: LogicalWindowSize = NO_NATIVE_SIZE, guardUntil = 0) {
  return { nativeSizeRef: { current: native }, guardUntilRef: { current: guardUntil } };
}

beforeEach(() => {
  setWindowSize.mockClear();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  resizeHandler = null;
});

describe("useWindowFrameSync", () => {
  it("просит у Rust размер из настроек", () => {
    const { nativeSizeRef, guardUntilRef } = refs();
    renderHook(() => {
      useWindowFrameSync(960, 680, false, false, true, nativeSizeRef, guardUntilRef);
    });
    expect(setWindowSize).toHaveBeenCalledWith(960, 680);
  });

  it("добавляет ширину колонки превью", () => {
    const { nativeSizeRef, guardUntilRef } = refs();
    renderHook(() => {
      useWindowFrameSync(960, 680, true, false, true, nativeSizeRef, guardUntilRef);
    });
    expect(setWindowSize).toHaveBeenCalledWith(960 + PREVIEW_EXTRA_WIDTH_PX, 680);
  });

  // Свёрнутое окно — это клубок 80px: доставить туда 960×680 значит раздуть его.
  it("свёрнутому окну размер не отправляется вовсе", () => {
    const { nativeSizeRef, guardUntilRef } = refs();
    renderHook(() => {
      useWindowFrameSync(960, 680, false, true, true, nativeSizeRef, guardUntilRef);
    });
    expect(setWindowSize).not.toHaveBeenCalled();
  });

  it("до готовности настроек ничего не отправляется", () => {
    const { nativeSizeRef, guardUntilRef } = refs();
    renderHook(() => {
      useWindowFrameSync(960, 680, false, false, false, nativeSizeRef, guardUntilRef);
    });
    expect(setWindowSize).not.toHaveBeenCalled();
  });

  // Эхо нативного размера означает «это уже сделал пользователь мышью».
  it("совпадение с эхом нативного размера — не трогать окно", () => {
    const { nativeSizeRef, guardUntilRef } = refs({ width: 960, height: 680 });
    renderHook(() => {
      useWindowFrameSync(960, 680, false, false, true, nativeSizeRef, guardUntilRef);
    });
    expect(setWindowSize).not.toHaveBeenCalled();
  });

  it("своя же отправка ставит гард против эха", () => {
    const { nativeSizeRef, guardUntilRef } = refs();
    renderHook(() => {
      useWindowFrameSync(960, 680, false, false, true, nativeSizeRef, guardUntilRef);
    });
    expect(guardUntilRef.current).toBeGreaterThan(Date.now());
  });
});

describe("useNativeResizeSync", () => {
  function mount(previewOpen = false, collapsed = false, ready = true, guardUntil = 0) {
    const apply = vi.fn();
    const { nativeSizeRef, guardUntilRef } = refs(NO_NATIVE_SIZE, guardUntil);
    const collapsedRef = { current: collapsed };
    renderHook(() => {
      useNativeResizeSync(previewOpen, collapsedRef, ready, nativeSizeRef, guardUntilRef, apply);
    });
    return { apply, nativeSizeRef };
  }

  function resize(size: LogicalWindowSize) {
    act(() => {
      resizeHandler?.(size);
    });
  }

  it("размер, выставленный мышью, уходит в настройки", () => {
    const { apply } = mount();
    resize({ width: 1000, height: 700 });
    expect(apply).toHaveBeenCalledWith(1000, 700);
  });

  it("вычитает ширину превью, чтобы в настройки шёл базовый размер", () => {
    const { apply } = mount(true);
    resize({ width: 1000 + PREVIEW_EXTRA_WIDTH_PX, height: 700 });
    expect(apply).toHaveBeenCalledWith(1000, 700);
  });

  // Кадр меньше минимума HUD физически не может быть выбором пользователя —
  // это клубок, и кламп превращал его 72px в сохранённые 300×520.
  it("кадры меньше минимума окна игнорируются целиком", () => {
    const { apply, nativeSizeRef } = mount();
    resize({ width: 72, height: 72 });
    expect(apply).not.toHaveBeenCalled();
    expect(nativeSizeRef.current).toEqual(NO_NATIVE_SIZE);
  });

  it("свёрнутое окно не обновляет ни эхо, ни настройки", () => {
    const { apply, nativeSizeRef } = mount(false, true);
    resize({ width: 1000, height: 700 });
    expect(apply).not.toHaveBeenCalled();
    expect(nativeSizeRef.current).toEqual(NO_NATIVE_SIZE);
  });

  it("под гардом эхо запоминается, но в настройки не уходит", () => {
    const { apply, nativeSizeRef } = mount(false, false, true, Date.now() + 10_000);
    resize({ width: 1000, height: 700 });
    expect(apply).not.toHaveBeenCalled();
    expect(nativeSizeRef.current).toEqual({ width: 1000, height: 700 });
  });
});
