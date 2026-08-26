import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { cleanupFixtures, fixture } from "./fixture.js";
import { type ContrastPair, checkContrast } from "./index.js";

afterAll(cleanupFixtures);

const CSS = `:root {
  --ground: oklch(0.2 0.01 40);
  --card: oklch(0.26 0.01 40);
  --ink: oklch(0.95 0.01 40);
  --dim: oklch(0.95 0.01 40 / 60%);
  --mark: oklch(0.62 0.05 40);
}

:root[data-theme="pale"] {
  --ground: oklch(0.99 0.002 40);
  --card: oklch(0.94 0.004 40);
  --ink: oklch(0.24 0.01 40);
  --dim: oklch(0.24 0.01 40 / 90%);
  --mark: oklch(0.5 0.05 40);
}
`;

const SCOPES: Record<string, string[]> = {
  dark: [":root"],
  pale: [":root", ':root[data-theme="pale"]'],
};
const PAIRS: ContrastPair[] = [
  { fg: ["ink", "dim"], bg: ["ground", "card"], min: 4.5 },
  { fg: "mark", bg: ["ground", "card"], min: 3 },
];

const run = (css = CSS, pairs = PAIRS, scopes = SCOPES) =>
  checkContrast({ cssPath: join(fixture({ "a.css": css }), "a.css"), scopes, pairs });

describe("what a healthy palette looks like", () => {
  it("passes both scopes, opaque and translucent alike", () => {
    const result = run();
    expect(result.failures).toEqual([]);
    expect(result.ok).toBe(true);
  });

  // Two scopes × (5 tokens in gamut + 6 pairs) — if this collapses to a handful
  // the cross product silently stopped expanding and every test below is empty.
  it("measures every token in every scope and every pair", () => {
    expect(run().checks).toBe(2 * (5 + 6));
  });
});

/**
 * The mutations. Each is a palette edit a designer could plausibly make, and
 * each has to come back red — a contrast check that cannot fail checks nothing.
 */
describe("a broken palette is caught", () => {
  it("catches text dropped below 4.5:1", () => {
    const result = run(CSS.replace("--ink: oklch(0.95 0.01 40);", "--ink: oklch(0.42 0.01 40);"));
    expect(result.ok).toBe(false);
    expect(result.failures[0]).toMatch(
      /^dark: TEXT --ink #\w+ on --ground #\w+ = \d\.\d\d:1 \(need 4\.5\)$/,
    );
  });

  it("catches a mark dropped below 3:1", () => {
    const result = run(CSS.replace("--mark: oklch(0.62 0.05 40);", "--mark: oklch(0.34 0.05 40);"));
    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("MARK --mark");
    expect(result.failures.join("\n")).toContain("(need 3)");
  });

  // Alpha is not decoration here: the same ink at 60% and at 12% are a pass and
  // a fail, and a check that ignored alpha would call both a pass.
  it("catches translucent text made too faint", () => {
    expect(run(CSS.replace("/ 60%)", "/ 12%)")).ok).toBe(false);
    expect(run(CSS.replace("/ 60%)", "/ 55%)")).ok).toBe(true);
  });

  it("catches a token pushed outside the sRGB gamut", () => {
    const result = run(
      CSS.replace("--mark: oklch(0.62 0.05 40);", "--mark: oklch(0.75 0.37 145);"),
    );
    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("outside sRGB");
  });

  // The failure mode the first version of this check had: `if (!t[fg]) return`
  // meant a renamed token stopped being measured and nothing went red.
  it("catches a pair whose token the scope does not declare", () => {
    const result = run(CSS, [{ fg: "ink", bg: "nowhere", min: 4.5 }]);
    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("nowhere is not declared here");
  });

  it("refuses to measure against a translucent ground", () => {
    const result = run(CSS, [{ fg: "ink", bg: "dim", min: 4.5 }]);
    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("translucent ground");
  });

  it("refuses a selector the stylesheet does not have", () => {
    expect(() => run(CSS, PAIRS, { ghost: [".missing"] })).toThrow(/selector not found/);
  });
});

describe("scopes are the cascade, not a flat file", () => {
  it("lets a later selector override an earlier one", () => {
    // `--ink` only fails once the pale scope has re-based the ground under it.
    const broken = CSS.replace("--ink: oklch(0.24 0.01 40);", "--ink: oklch(0.88 0.01 40);");
    const result = run(broken);
    expect(result.failures.every((line) => line.startsWith("pale:"))).toBe(true);
    expect(result.failures.length).toBeGreaterThan(0);
  });

  it("keeps the scopes independent", () => {
    const oneScope = run(CSS, PAIRS, { dark: [":root"] });
    expect(oneScope.checks).toBe(5 + 6);
  });
});
