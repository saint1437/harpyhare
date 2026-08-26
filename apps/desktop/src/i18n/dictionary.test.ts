import { describe, expect, it } from "vitest";
import { LOCALES, dictionary, type Locale } from ".";
import type { Dictionary } from "./types";

/**
 * Completeness of the two locales is a TYPE guarantee — both are declared
 * `Dictionary`, so a key present in one and missing in the other fails `tsc`.
 * What the compiler cannot see is a key that is present and EMPTY, which is the
 * shape a half-finished translation takes: `tsc` is happy, the screen is blank.
 * These two walks are that half.
 */
interface Leaf {
  path: string;
  value: string;
}

function leaves(node: unknown, path: string, out: Leaf[]): void {
  if (typeof node === "string") {
    out.push({ path, value: node });
    return;
  }
  if (typeof node !== "object" || node === null) return;
  for (const [key, child] of Object.entries(node)) {
    leaves(child, path === "" ? key : `${path}.${key}`, out);
  }
}

function dictionaryLeaves(locale: Locale): Leaf[] {
  const out: Leaf[] = [];
  // `locale` is a leaf of the dictionary itself and the one string that is a
  // machine value rather than copy; everything else is text for a human.
  const { locale: _locale, ...copy } = dictionary(locale) as Dictionary & Record<string, unknown>;
  leaves(copy, "", out);
  return out;
}

describe.each(LOCALES)("словарь %s", (locale) => {
  it("не содержит пустых строк", () => {
    const blank = dictionaryLeaves(locale)
      .filter((leaf) => leaf.value.trim() === "")
      .map((leaf) => leaf.path);
    expect(blank).toEqual([]);
  });

  it("не содержит незакрытых подстановок вида {name (без скобки)", () => {
    const broken = dictionaryLeaves(locale)
      .filter((leaf) => /\{\w*$|\{[^}]*\{/u.test(leaf.value))
      .map((leaf) => leaf.path);
    expect(broken).toEqual([]);
  });
});

/**
 * The two dictionaries must describe the same tree. The compiler already says
 * so for the keys it can see; this catches the one case it cannot — an optional
 * field filled in one locale and omitted in the other, which would leave the
 * second showing nothing where the first shows a sentence.
 */
it("обе локали описывают одно и то же дерево ключей", () => {
  const paths = (locale: Locale) =>
    dictionaryLeaves(locale)
      .map((leaf) => leaf.path)
      .sort();
  expect(paths("en")).toEqual(paths("ru"));
});

it("каждая локаль знает своё имя", () => {
  for (const locale of LOCALES) {
    expect(dictionary(locale).locale).toBe(locale);
  }
});
