import { describe, expect, it } from "vitest";
import { SETTINGS_LIMITS } from "@/ipc/bindings";
import {
  clampWindowSize,
  stepWindowSize,
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
