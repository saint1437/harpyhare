import { describe, expect, it } from "vitest";
import { advanceReveal, REVEAL_MIN_CHARS_PER_SECOND, sliceRevealed } from "./stream-reveal";

describe("advanceReveal", () => {
  it("не двигается при нулевом dt", () => {
    expect(advanceReveal(5, 100, 0)).toBe(5);
  });

  it("держит минимальную скорость при маленьком отставании", () => {
    expect(advanceReveal(0, 1000, 100)).toBeGreaterThanOrEqual(REVEAL_MIN_CHARS_PER_SECOND * 0.1);
  });

  it("ускоряется пропорционально отставанию", () => {
    expect(advanceReveal(0, 1000, 50)).toBe(500);
  });

  it("не выходит за длину текста", () => {
    expect(advanceReveal(90, 100, 1000)).toBe(100);
  });

  it("схлопывается к total, когда revealed уже за ним", () => {
    expect(advanceReveal(100, 80, 16)).toBe(80);
  });
});

describe("sliceRevealed", () => {
  it("режет по целому числу символов вниз", () => {
    expect(sliceRevealed("абвгд", 3.9)).toBe("абв");
  });

  it("не разрывает суррогатную пару", () => {
    expect(sliceRevealed("а😀б", 2)).toBe("а😀");
  });

  it("отдаёт весь текст, когда revealed за длиной", () => {
    expect(sliceRevealed("аб", 10)).toBe("аб");
  });

  it("пустая строка при нуле", () => {
    expect(sliceRevealed("аб", 0)).toBe("");
  });
});
