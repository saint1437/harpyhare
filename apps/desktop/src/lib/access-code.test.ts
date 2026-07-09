import { describe, expect, it } from "vitest";
import { normalizeAccessCode } from "./access-code";

describe("normalizeAccessCode", () => {
  it("uppercases and strips dashes and spaces", () => {
    expect(normalizeAccessCode("ms24h-9dmrw-40jdh-ztj9x")).toBe("MS24H9DMRW40JDHZTJ9X");
    expect(normalizeAccessCode("  ms24h 9dmrw  ")).toBe("MS24H9DMRW");
  });

  it("maps ambiguous Crockford letters to digits", () => {
    expect(normalizeAccessCode("ILO")).toBe("110");
    expect(normalizeAccessCode("io-li")).toBe("1011");
  });

  it("drops any other punctuation", () => {
    expect(normalizeAccessCode("ab.cd_ef")).toBe("ABCDEF");
  });

  it("is idempotent", () => {
    const once = normalizeAccessCode("ms24h-9dmrw");
    expect(normalizeAccessCode(once)).toBe(once);
  });
});
