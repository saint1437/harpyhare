import { describe, expect, it } from "vitest";
import { applyOpacity, moveDelta } from "./window-controls";

describe("moveDelta", () => {
  it("стрелки → сдвиг на шаг по нужной оси", () => {
    expect(moveDelta("ArrowLeft", 20)).toEqual({ dx: -20, dy: 0 });
    expect(moveDelta("ArrowRight", 20)).toEqual({ dx: 20, dy: 0 });
    expect(moveDelta("ArrowUp", 35)).toEqual({ dx: 0, dy: -35 });
    expect(moveDelta("ArrowDown", 35)).toEqual({ dx: 0, dy: 35 });
  });
  it("не-стрелка → null", () => {
    expect(moveDelta("KeyV", 20)).toBeNull();
  });
});

describe("applyOpacity", () => {
  it("ставит CSS-переменную с клампом 0.2..1", () => {
    const el = document.createElement("div");
    applyOpacity(el, 0.5);
    expect(el.style.getPropertyValue("--app-opacity")).toBe("0.5");
    applyOpacity(el, 0.01);
    expect(el.style.getPropertyValue("--app-opacity")).toBe("0.2");
    applyOpacity(el, 7);
    expect(el.style.getPropertyValue("--app-opacity")).toBe("1");
  });
});
