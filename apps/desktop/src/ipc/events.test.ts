import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tick } from "@/test-utils/async";

interface Size {
  width: number;
  height: number;
}
let resize: ((event: { payload: Size }) => void) | undefined;
let dpiChange: ((event: { payload: { scaleFactor: number; size: Size } }) => void) | undefined;
const offResize = vi.fn();
const offScale = vi.fn();
const scaleFactor = vi.fn<() => Promise<number>>(() => Promise.resolve(1));
const onResized = vi.fn((handler: typeof resize) => {
  resize = handler;
  return Promise.resolve(offResize);
});
const onScaleChanged = vi.fn((handler: typeof dpiChange) => {
  dpiChange = handler;
  return Promise.resolve(offScale);
});

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ scaleFactor, onResized, onScaleChanged }),
}));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
vi.mock("@tauri-apps/api/webview", () => ({ getCurrentWebview: vi.fn() }));

import { onWindowResized } from "./events";

const originalDpr = window.devicePixelRatio;
beforeEach(() => {
  vi.clearAllMocks();
  scaleFactor.mockResolvedValue(1);
  resize = undefined;
  dpiChange = undefined;
  Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 1.17 });
});
afterEach(() => {
  Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: originalDpr });
});

describe("native resize — OS DPI is independent of WebView zoom", () => {
  it("browser zoom 117% does not shrink the saved native window dimensions", async () => {
    const handler = vi.fn();
    const stop = onWindowResized(handler);
    await tick();
    resize?.({ payload: { width: 960, height: 680 } });
    expect(handler).toHaveBeenLastCalledWith({ width: 960, height: 680 });
    stop();
  });

  it("buffers the latest resize until the initial native scale is known", async () => {
    let resolveScale: ((scale: number) => void) | undefined;
    scaleFactor.mockReturnValue(
      new Promise((resolve) => {
        resolveScale = resolve;
      }),
    );
    const handler = vi.fn();
    const stop = onWindowResized(handler);
    resize?.({ payload: { width: 1000, height: 700 } });
    resize?.({ payload: { width: 1440, height: 1020 } });
    expect(handler).not.toHaveBeenCalled();
    resolveScale?.(1.5);
    await tick();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ width: 960, height: 680 });
    stop();
  });

  it("uses new monitor DPI without an IPC request on every resize event", async () => {
    const handler = vi.fn();
    const stop = onWindowResized(handler);
    await tick();
    dpiChange?.({ payload: { scaleFactor: 2, size: { width: 1920, height: 1360 } } });
    for (let i = 0; i < 10; i++) resize?.({ payload: { width: 2000, height: 1400 } });
    expect(handler).toHaveBeenLastCalledWith({ width: 1000, height: 700 });
    expect(scaleFactor).toHaveBeenCalledTimes(1);
    stop();
  });

  it("a newer DPI event wins over a delayed initial scale read", async () => {
    let resolveScale: ((scale: number) => void) | undefined;
    scaleFactor.mockReturnValue(
      new Promise((resolve) => {
        resolveScale = resolve;
      }),
    );
    const handler = vi.fn();
    const stop = onWindowResized(handler);
    dpiChange?.({ payload: { scaleFactor: 2, size: { width: 1920, height: 1360 } } });
    resolveScale?.(1);
    await tick();
    resize?.({ payload: { width: 1920, height: 1360 } });
    expect(handler).toHaveBeenLastCalledWith({ width: 960, height: 680 });
    stop();
  });

  it("unmount removes both listeners and discards pending scale/resize results", async () => {
    const handler = vi.fn();
    const stop = onWindowResized(handler);
    stop();
    await tick();
    resize?.({ payload: { width: 168, height: 48 } });
    dpiChange?.({ payload: { scaleFactor: 2, size: { width: 168, height: 48 } } });
    expect(handler).not.toHaveBeenCalled();
    expect(offResize).toHaveBeenCalledTimes(1);
    expect(offScale).toHaveBeenCalledTimes(1);
  });
});
