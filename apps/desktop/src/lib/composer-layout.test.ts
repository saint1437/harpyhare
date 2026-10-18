import { describe, expect, it } from "vitest";
import { composerCardHeight, composerZone } from "./composer-layout";

describe("composerZone", () => {
  it("пустая карточка резервирует поле и все кнопки, выноса нет", () => {
    expect(composerZone({ card: 74, row: 40, toolbar: 34, content: 74, bar: 0 }, 6)).toEqual({
      slot: 74,
      overflow: 0,
    });
  });

  it("вложение выносится над лентой, но тулбар остаётся в постоянном слоте", () => {
    expect(composerZone({ card: 120, row: 40, toolbar: 34, content: 120, bar: 0 }, 6)).toEqual({
      slot: 74,
      overflow: 46,
    });
  });

  it("во время анимации вынос следует за фактической высотой карточки", () => {
    expect(composerZone({ card: 91, row: 40, toolbar: 34, content: 120, bar: 0 }, 6).overflow).toBe(
      17,
    );
  });

  it("полоса быстрых действий с зазором входит в слот и не считается выносом", () => {
    expect(composerZone({ card: 74, row: 40, toolbar: 34, content: 74, bar: 26 }, 6)).toEqual({
      slot: 106,
      overflow: 0,
    });
    expect(composerZone({ card: 120, row: 40, toolbar: 34, content: 120, bar: 26 }, 6)).toEqual({
      slot: 106,
      overflow: 46,
    });
  });

  it("выросшее поле поднимает и слот, и раскрытую карточку", () => {
    expect(composerZone({ card: 100, row: 60, toolbar: 34, content: 100, bar: 0 }, 6)).toEqual({
      slot: 94,
      overflow: 6,
    });
  });
});

describe("composerCardHeight", () => {
  it("потеря фокуса и отправка не обрезают постоянный тулбар", () => {
    const measure = { card: 74, row: 40, toolbar: 34, content: 74, bar: 0 };
    expect(composerCardHeight(measure, true)).toBe(74);
    expect(composerCardHeight(measure, false)).toBe(74);
  });

  it("раскрытая карточка учитывает вложения поверх постоянных строк", () => {
    const measure = { card: 120, row: 40, toolbar: 34, content: 120, bar: 0 };
    expect(composerCardHeight(measure, true)).toBe(120);
    expect(composerCardHeight(measure, false)).toBe(74);
  });
});
