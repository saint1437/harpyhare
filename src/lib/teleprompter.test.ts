import { describe, expect, it } from "vitest";
import {
  advanceOffset,
  clampFont,
  clampSpeed,
  TELEPROMPTER_FONT_MAX,
  TELEPROMPTER_FONT_MIN,
  TELEPROMPTER_SPEED_MAX,
  TELEPROMPTER_SPEED_MIN,
  toReadingText,
} from "./teleprompter";

describe("clampSpeed / clampFont", () => {
  it("зажимают в допустимый диапазон", () => {
    expect(clampSpeed(0)).toBe(TELEPROMPTER_SPEED_MIN);
    expect(clampSpeed(9999)).toBe(TELEPROMPTER_SPEED_MAX);
    expect(clampSpeed(40)).toBe(40);
    expect(clampFont(1)).toBe(TELEPROMPTER_FONT_MIN);
    expect(clampFont(9999)).toBe(TELEPROMPTER_FONT_MAX);
    expect(clampFont(28)).toBe(28);
  });
});

describe("advanceOffset", () => {
  it("двигает на speed*dt/1000 пикселей", () => {
    expect(advanceOffset(0, 40, 1000, 500)).toBe(40);
    expect(advanceOffset(100, 60, 500, 500)).toBe(130);
  });
  it("не уходит ниже нуля и выше maxOffset", () => {
    expect(advanceOffset(0, -100, 1000, 500)).toBe(0);
    expect(advanceOffset(490, 100, 1000, 500)).toBe(500);
  });
  it("maxOffset отрицательный (контент короче окна) → остаётся 0", () => {
    expect(advanceOffset(0, 40, 1000, -50)).toBe(0);
  });
});

describe("toReadingText", () => {
  it("снимает жирный/курсив/инлайн-код", () => {
    expect(toReadingText("это **важно** и *курсив* и `код`")).toBe("это важно и курсив и код");
  });
  it("убирает заголовки, цитаты и маркеры списков", () => {
    const md = "# Заголовок\n\n> цитата\n\n- пункт один\n- пункт два\n\n1. первый";
    expect(toReadingText(md)).toBe("Заголовок\n\nцитата\n\nпункт один\nпункт два\n\nпервый");
  });
  it("выкидывает ограждения код-блока, оставляя содержимое", () => {
    const md = "Пример:\n\n```js\nconst a = 1;\n```\n\nконец";
    expect(toReadingText(md)).toBe("Пример:\n\nconst a = 1;\n\nконец");
  });
  it("ссылку заменяет её текстом, картинку убирает", () => {
    expect(toReadingText("см. [доку](https://x.dev) ![img](y.png)")).toBe("см. доку");
  });
  it("схлопывает лишние пустые строки и обрезает края", () => {
    expect(toReadingText("\n\nтекст\n\n\n\nещё\n\n")).toBe("текст\n\nещё");
  });
  it("подчёркивание внутри слова не трогает (snake_case)", () => {
    expect(toReadingText("teleprompter_font_size")).toBe("teleprompter_font_size");
  });
});
