import { describe, expect, it } from "vitest";
import { format } from "./format";

describe("format", () => {
  it("подставляет значения по имени", () => {
    expect(format("{count} строк", { count: 12 })).toBe("12 строк");
    expect(format("{used} из {max}", { used: 1, max: 2 })).toBe("1 из 2");
  });

  it("повторяет одно значение столько раз, сколько оно встречается", () => {
    expect(format("{a}-{a}", { a: "x" })).toBe("x-x");
  });

  it("убирает дырку, для которой нет значения", () => {
    expect(format("Проверьте интернет. {details}", {})).toBe("Проверьте интернет.");
  });

  it("уносит с собой висящую пунктуацию", () => {
    expect(format("Ошибка — {details}", {})).toBe("Ошибка");
    expect(format("Ошибка: {details}", {})).toBe("Ошибка");
  });

  it("не трогает текст без дырок", () => {
    expect(format("Готово", { count: 1 })).toBe("Готово");
  });

  it("оставляет ноль как значение, а не как пустоту", () => {
    expect(format("Не отправлено реплик: {count}.", { count: 0 })).toBe("Не отправлено реплик: 0.");
  });
});
