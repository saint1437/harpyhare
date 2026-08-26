import { describe, expect, it } from "vitest";
import {
  HUD_DARK_ARMS,
  HUD_SCOPES,
  HUD_SELECTORS,
  hudBlock,
  hudDeclarationList,
  hudScope,
} from "./index.js";

/**
 * The blind spot this file exists to close.
 *
 * `hud.css` states its dark theme twice — once under
 * `@media (prefers-color-scheme: dark)` and once under `[data-theme="dark"]` —
 * because CSS cannot OR a media query with a selector and the app deliberately
 * leaves `system` unresolved in JS. Until this file existed, NOTHING measured
 * the media arm: the desktop's contrast check read the attribute arm and the
 * launcher blocks, and a value edited in one arm and forgotten in the other
 * would have shipped a theme that changes when the user picks "dark" from the
 * menu — the one action that is supposed to change nothing for a dark OS.
 *
 * It is not hypothetical. The file this palette came from carried
 * `--on-scrim: oklch(0.985 0.004 40);` TWICE inside the media arm and once in
 * the attribute arm: a copy-paste that happened to be harmless. `declares each
 * token exactly once` below is the assertion that would have said so.
 *
 * The other half of the fix is in `apps/desktop/scripts/check-contrast.mjs`:
 * the media arms are now scopes of their own there, so they are held to AA and
 * to the sRGB gamut on their own terms. This file asserts they are the same
 * text; that file asserts the text is correct. Neither replaces the other —
 * two identical arms can be identically wrong.
 */
describe("the two arms of the dark theme", () => {
  it.each(HUD_DARK_ARMS)("`%s` declares exactly what `%s` declares", (system, forced) => {
    expect(hudDeclarationList(system)).toEqual(hudDeclarationList(forced));
  });

  // Both arms being empty would satisfy the assertion above.
  it("is not comparing two empty blocks", () => {
    for (const [system] of HUD_DARK_ARMS) {
      expect(hudDeclarationList(system).length).toBeGreaterThan(4);
    }
  });
});

describe("the shape of the layer", () => {
  it.each(Object.keys(HUD_SELECTORS) as (keyof typeof HUD_SELECTORS)[])(
    "`%s` declares each token exactly once",
    (block) => {
      const names = hudDeclarationList(block).map(([name]) => name);
      expect(names).toEqual([...new Set(names)]);
    },
  );

  /**
   * A token that exists only in dark renders as nothing in light — Tailwind
   * emits the utility either way, and `var(--missing)` is not a colour. Light
   * is therefore the complete set and every other block may only override.
   */
  it.each([["dark"], ["launcherLight"], ["launcherDark"]] as const)(
    "`%s` overrides tokens `light` already declares, and invents none",
    (block) => {
      const light = new Set(Object.keys(hudBlock("light")));
      expect(Object.keys(hudBlock(block)).filter((name) => !light.has(name))).toEqual([]);
    },
  );

  it("re-bases the launcher's surfaces and nothing else", () => {
    expect(Object.keys(hudBlock("launcherLight"))).toEqual([
      "--base",
      "--surface",
      "--elevated",
      "--inset",
      "--surface-active",
    ]);
    expect(Object.keys(hudBlock("launcherDark"))).toEqual(Object.keys(hudBlock("launcherLight")));
  });
});

describe("the scopes a browser can be in", () => {
  it.each(Object.keys(HUD_SCOPES))("`%s` resolves every token of the layer", (scope) => {
    expect(Object.keys(hudScope(scope)).sort()).toEqual(Object.keys(hudBlock("light")).sort());
  });

  it("puts the launcher a step below the HUD, in both themes", () => {
    expect(hudScope("light · launcher")["--base"]).not.toBe(hudScope("light · HUD")["--base"]);
    expect(hudScope("dark · launcher")["--base"]).toBe("oklch(0.17 0.005 40)");
    expect(hudScope("dark · HUD")["--base"]).toBe("oklch(0.235 0.005 40)");
  });

  it("resolves the OS-triggered scopes to the same values as the forced ones", () => {
    expect(hudScope("dark · HUD · system")).toEqual(hudScope("dark · HUD"));
    expect(hudScope("dark · launcher · system")).toEqual(hudScope("dark · launcher"));
  });
});

/**
 * The replica the landing page generates reads exactly these names. A rename
 * here without a rename in `apps/landing/scripts/sync-app-tokens.mjs` already
 * fails there (the generator throws on a token it cannot find); this is the
 * near half of the same fence, so the break is reported by the package that
 * caused it.
 */
describe("what a replica is promised", () => {
  const dark = hudScope("dark · HUD");

  it.each([
    "--base",
    "--surface",
    "--elevated",
    "--inset",
    "--surface-active",
    "--line",
    "--fg",
    "--fg-muted",
    "--accent",
    "--accent-hover",
    "--accent-on",
    "--accent-mark",
    "--danger",
    "--listening",
  ])("dark declares %s", (name) => {
    expect(dark[name]).toMatch(/^oklch\(/);
  });

  it("keeps `listening` cyan and `danger` red — they must not be confusable", () => {
    const hue = (value: string) => Number(/oklch\([\d.]+ [\d.]+ ([\d.]+)/.exec(value)?.[1]);
    expect(hue(dark["--listening"] ?? "")).toBeGreaterThan(150);
    expect(hue(dark["--danger"] ?? "")).toBeLessThan(60);
  });

  it("carries the type scale the replica copies", () => {
    expect(hudBlock("light")["--hud-text-body"]).toBe("13px");
    expect(hudBlock("light")["--hud-text-title"]).toBe("16px");
  });
});
