import { describe, expect, it } from "vitest";
import { SETTINGS_LIMITS } from "@/ipc/types";
import {
  clampWindowSize,
  nativeSizeEcho,
  stepWindowSize,
  windowSizesEqual,
  WINDOW_HEIGHT_MAX_PX,
  WINDOW_HEIGHT_MIN_PX,
  WINDOW_WIDTH_MAX_PX,
  WINDOW_WIDTH_MIN_PX,
} from "./window-size";

describe("stepWindowSize", () => {
  it("шагает ширину, не трогая высоту", () => {
    expect(stepWindowSize({ width: 960, height: 680 }, "width", 1, 20)).toEqual({
      width: 980,
      height: 680,
    });
  });

  it("шагает высоту вниз", () => {
    expect(stepWindowSize({ width: 960, height: 680 }, "height", -1, 20)).toEqual({
      width: 960,
      height: 660,
    });
  });

  it("клампит по минимуму ширины", () => {
    expect(stepWindowSize({ width: 320, height: 680 }, "width", -1, 40).width).toBe(
      WINDOW_WIDTH_MIN_PX,
    );
  });

  it("клампит по максимуму высоты", () => {
    expect(stepWindowSize({ width: 960, height: 1090 }, "height", 1, 40).height).toBe(
      WINDOW_HEIGHT_MAX_PX,
    );
  });
});

describe("clampWindowSize", () => {
  it("пропускает размер в границах", () => {
    expect(clampWindowSize({ width: 960, height: 680 })).toEqual({ width: 960, height: 680 });
  });

  it("клампит обе размерности", () => {
    expect(clampWindowSize({ width: 100, height: 5000 })).toEqual({
      width: 300,
      height: 1100,
    });
  });
});

describe("границы окна", () => {
  it("совпадают с реестром лимитов в Rust", () => {
    expect(WINDOW_WIDTH_MIN_PX).toBe(SETTINGS_LIMITS.windowWidth.min);
    expect(WINDOW_WIDTH_MAX_PX).toBe(SETTINGS_LIMITS.windowWidth.max);
    expect(WINDOW_HEIGHT_MIN_PX).toBe(SETTINGS_LIMITS.windowHeight.min);
    expect(WINDOW_HEIGHT_MAX_PX).toBe(SETTINGS_LIMITS.windowHeight.max);
  });
});

describe("эхо нативного ресайза", () => {
  it("размер, пришедший от пользователя, распознаётся как эхо", () => {
    const native = { width: 961, height: 683 };
    expect(nativeSizeEcho(native, 0)).toEqual(native);
  });

  it("превью-экстра не участвует в клампе базовой ширины", () => {
    const extra = 580;
    expect(nativeSizeEcho({ width: 960 + extra, height: 680 }, extra)).toEqual({
      width: 960 + extra,
      height: 680,
    });
  });

  it("протяжка за максимум даёт клампнутое эхо, а не бесконечную драку", () => {
    expect(nativeSizeEcho({ width: 1700, height: 1200 }, 0)).toEqual({
      width: WINDOW_WIDTH_MAX_PX,
      height: WINDOW_HEIGHT_MAX_PX,
    });
  });

  it("равенство размеров терпит округление логических пикселей", () => {
    expect(windowSizesEqual({ width: 960.4, height: 680 }, { width: 961, height: 680 })).toBe(true);
    expect(windowSizesEqual({ width: 960, height: 680 }, { width: 964, height: 680 })).toBe(false);
  });
});
