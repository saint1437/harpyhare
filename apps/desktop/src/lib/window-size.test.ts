import { describe, expect, it } from "vitest";
import {
  resizeKeyFromCode,
  stepWindowSize,
  WINDOW_HEIGHT_MAX_PX,
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

describe("resizeKeyFromCode", () => {
  it.each([
    ["ArrowLeft", { dim: "width", dir: -1 }],
    ["ArrowRight", { dim: "width", dir: 1 }],
    ["ArrowUp", { dim: "height", dir: -1 }],
    ["ArrowDown", { dim: "height", dir: 1 }],
  ])("%s → %j", (code, expected) => {
    expect(resizeKeyFromCode(code)).toEqual(expected);
  });

  it("прочие коды → null", () => {
    expect(resizeKeyFromCode("Equal")).toBeNull();
  });
});
