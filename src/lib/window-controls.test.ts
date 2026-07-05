import { describe, expect, it } from "vitest";
import { applyChatFontSize, applyOpacity, moveDelta, stepOpacity } from "./window-controls";

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

  it("NaN/Infinity игнорируются — значение не меняется", () => {
    const el = document.createElement("div");
    applyOpacity(el, 0.5);
    applyOpacity(el, NaN);
    expect(el.style.getPropertyValue("--app-opacity")).toBe("0.5");
    applyOpacity(el, Infinity);
    expect(el.style.getPropertyValue("--app-opacity")).toBe("0.5");
  });
});

describe("applyChatFontSize", () => {
  it("ставит --chat-font-size в px с клампом 10..20", () => {
    const el = document.createElement("div");
    applyChatFontSize(el, 15);
    expect(el.style.getPropertyValue("--chat-font-size")).toBe("15px");
    applyChatFontSize(el, 5);
    expect(el.style.getPropertyValue("--chat-font-size")).toBe("10px");
    applyChatFontSize(el, 99);
    expect(el.style.getPropertyValue("--chat-font-size")).toBe("20px");
    applyChatFontSize(el, NaN);
    expect(el.style.getPropertyValue("--chat-font-size")).toBe("20px");
  });
});

describe("stepOpacity", () => {
  it("шаг вверх/вниз", () => {
    expect(stepOpacity(0.5, 1, 0.1)).toBeCloseTo(0.6);
    expect(stepOpacity(0.5, -1, 0.1)).toBeCloseTo(0.4);
  });
  it("кламп в [0.2, 1]", () => {
    expect(stepOpacity(0.95, 1, 0.1)).toBe(1);
    expect(stepOpacity(1, 1, 0.1)).toBe(1);
    expect(stepOpacity(0.25, -1, 0.1)).toBe(0.2);
    expect(stepOpacity(0.2, -1, 0.1)).toBe(0.2);
  });
  it("без дрейфа float", () => {
    expect(stepOpacity(0.7, 1, 0.1)).toBe(0.8);
  });
});
