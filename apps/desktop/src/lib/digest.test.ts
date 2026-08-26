import { describe, expect, it } from "vitest";
import { digest } from "./digest";

describe("digest", () => {
  it("is stable for the same input", () => {
    expect(digest("hello")).toBe(digest("hello"));
  });

  it("separates inputs that differ only in content", () => {
    expect(digest("hello")).not.toBe(digest("hellp"));
  });

  it("separates inputs that differ only in length", () => {
    expect(digest("a")).not.toBe(digest("aa"));
  });

  it("carries the length so equal hashes still separate by size", () => {
    expect(digest("abc").startsWith("3.")).toBe(true);
    expect(digest("").startsWith("0.")).toBe(true);
  });

  it("stays short for very large inputs", () => {
    expect(digest("x".repeat(2_000_000)).length).toBeLessThan(24);
  });

  it("handles non-ASCII without throwing", () => {
    expect(digest("Привет, мир")).toBe(digest("Привет, мир"));
    expect(digest("Привет")).not.toBe(digest("Привет!"));
  });
});
