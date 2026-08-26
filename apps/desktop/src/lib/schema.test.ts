import { describe, expect, it } from "vitest";
import { bool, list, nonEmptyStr, num, obj, oneOf, str, type Infer } from "./schema";

describe("schema", () => {
  it("подставляет фолбэк вместо значения не того типа", () => {
    expect(str("нет").parse(42)).toBe("нет");
    expect(str().parse("есть")).toBe("есть");
    expect(bool(true).parse("да")).toBe(true);
    expect(bool().parse(false)).toBe(false);
    expect(num(7).parse("8")).toBe(7);
    expect(num(7).parse(Number.NaN)).toBe(7);
    expect(num(7).parse(Number.POSITIVE_INFINITY)).toBe(7);
  });

  it("nonEmptyStr считает пустую строку отсутствующей", () => {
    expect(nonEmptyStr("модель").parse("")).toBe("модель");
    expect(nonEmptyStr("модель").parse("своя")).toBe("своя");
  });

  it("num зажимает по границам", () => {
    expect(num(0, { min: 0 }).parse(-5)).toBe(0);
    expect(num(0, { max: 10 }).parse(50)).toBe(10);
  });

  it("oneOf принимает только перечисленные значения", () => {
    const role = oneOf(["user", "assistant"] as const, "user");
    expect(role.parse("assistant")).toBe("assistant");
    expect(role.parse("system")).toBe("user");
  });

  it("list отбрасывает не-массив и, по предикату, мусорные элементы", () => {
    const ids = list(str(), (id) => id !== "");
    expect(ids.parse("не массив")).toEqual([]);
    expect(ids.parse(["a", 1, "b"])).toEqual(["a", "b"]);
  });

  // The whole point of salvage: one bad field costs that field, not the record.
  it("obj чинит поле, а не весь объект", () => {
    const point = obj({ x: num(0), y: num(0), label: str("без имени") });
    expect(point.parse({ x: 3, y: "боком", label: "точка" })).toEqual({
      x: 3,
      y: 0,
      label: "точка",
    });
    expect(point.parse(null)).toEqual({ x: 0, y: 0, label: "без имени" });
    expect(point.parse("вообще не объект")).toEqual({ x: 0, y: 0, label: "без имени" });
  });

  it("тип выводится из схемы", () => {
    const schema = obj({ id: str(), count: num(), on: bool(), tags: list(str()) });
    const parsed: Infer<typeof schema> = schema.parse({ id: "a", count: 2, on: true, tags: ["t"] });
    expect(parsed).toEqual({ id: "a", count: 2, on: true, tags: ["t"] });
  });
});
