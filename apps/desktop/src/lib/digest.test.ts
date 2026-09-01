import { describe, expect, it } from "vitest";
import { textDigest } from "./digest";

describe("textDigest", () => {
  it("одинаковый текст даёт одинаковый отпечаток", () => {
    expect(textDigest("системный промпт")).toBe(textDigest("системный промпт"));
  });

  it("различает тексты одной длины", () => {
    expect(textDigest("abc")).not.toBe(textDigest("abd"));
  });

  it("различает перестановку символов", () => {
    expect(textDigest("ab")).not.toBe(textDigest("ba"));
  });

  it("пустой текст имеет свой отпечаток", () => {
    expect(textDigest("")).not.toBe(textDigest(" "));
  });

  it("не сталкивается на близких длинных промптах", () => {
    const base = "Ты — senior-инженер на собеседовании. ".repeat(500);
    expect(textDigest(base)).not.toBe(textDigest(`${base}.`));
    expect(textDigest(`${base}a`)).not.toBe(textDigest(`${base}b`));
  });
});
