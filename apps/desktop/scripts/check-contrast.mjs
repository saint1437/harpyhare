/**
 * The palette is measured, not eyeballed.
 *
 * Reads the tokens straight out of the stylesheet that declares them — so the
 * check can never drift from the values it checks — resolves every scope a
 * browser can actually be in, and asserts:
 *
 *   • WCAG AA: 4.5:1 for text, 3:1 for UI components and graphical objects.
 *     The type scale tops out at 16px, so the 3:1 large-text allowance applies
 *     to nothing and every text token is held to 4.5:1.
 *   • every token sits inside the sRGB gamut, so nothing is silently
 *     gamut-mapped by the browser into a colour nobody chose.
 *
 * The mechanic is `@harpyhare/checks`; the palette is `@harpyhare/tokens`, which
 * `src/index.css` imports rather than copies. Both the file and the list of
 * scopes come from the package: adding a block to the stylesheet and forgetting
 * to measure it would mean editing `HUD_SCOPES` right next to it.
 *
 * SIX SCOPES, NOT FOUR — the blind spot this check used to have. The dark theme
 * is stated twice, under `@media (prefers-color-scheme: dark)` and under
 * `[data-theme="dark"]`, because `system` is deliberately not resolved in JS
 * (`lib/window-controls.ts` explains why) and CSS cannot OR a media query with
 * a selector. The old scope list read only the attribute arm, so every value in
 * the media arm — what a dark-OS user on the default "system" setting actually
 * sees — was measured by nothing at all. It is measured here now, and
 * `packages/tokens/hud.test.ts` separately asserts the two arms are the same
 * text. Two identical arms can still be identically wrong, which is why both
 * halves exist.
 *
 * `--accent` is deliberately NOT held to 3:1 against every surface.
 *
 * No oxblood lightness satisfies both "3:1 against the HUD's card surface" and
 * "carries its own label at 4.5:1" — the two pull luminance in opposite
 * directions and cross around OKLCH L 0.575 without ever both holding. That is
 * exactly why `--accent-mark` exists: the accent is a FILL, identified by its
 * label (checked below at 4.5:1) and its shadow, while every small graphical
 * mark uses `--accent-mark`, which is held to 3:1 on all four surfaces.
 *
 * WCAG 1.4.11 agrees: a control's boundary is exempt where the control is
 * identifiable by other means. Removing this check is therefore a decision,
 * not a loophole — and the old palette's failure was the opposite case, an
 * accent used as a bare mark at 1.57–2.71:1 with nothing else to identify it.
 *
 * Deliberately NOT checked either: contrast between two state colours. Colours
 * that must each clear 3:1 against the same ground necessarily land at similar
 * luminance, and success/danger are indistinguishable to a red-green
 * colour-blind user at any luminance. That is what the glyph-and-word rule is
 * for — colour is never the only carrier.
 *
 * Run: node scripts/check-contrast.mjs
 */
import { readFileSync } from "node:fs";
import { checkContrast, report } from "@harpyhare/checks";
import { HUD_CSS_PATH, HUD_SCOPES } from "@harpyhare/tokens";

const SURFACES = ["base", "surface", "elevated", "inset"];

const contrast = checkContrast({
  cssPath: HUD_CSS_PATH,
  scopes: HUD_SCOPES,
  pairs: [
    { fg: ["fg", "fg-muted", "fg-subtle", "danger", "listening"], bg: SURFACES, min: 4.5 },
    {
      fg: [
        "accent-mark",
        "listening",
        "listening-dim",
        "success",
        "warning",
        "danger",
        "line-strong",
        "focus",
      ],
      bg: SURFACES,
      min: 3,
    },
    { fg: "accent-on", bg: ["accent", "accent-hover"], min: 4.5 },
    { fg: "accent", bg: "base", min: 3 },
  ],
});

/**
 * The seam the move to a package opened, closed.
 *
 * The check above reads the PACKAGE, so a colour token declared in `index.css`
 * would win in the browser (it is imported first, so anything after it in the
 * file overrides it) and be invisible to every assertion here. The palette is
 * oklch-only by rule, which makes the stray easy to name: any `--token: oklch(…)`
 * outside the package is a palette value that nothing measures.
 *
 * `--radius`, `--window-radius`, `--app-opacity` and the motion tokens are not
 * colours and stay where they are.
 */
const INDEX_CSS = new URL("../src/index.css", import.meta.url);
const COLOUR_DECLARATION = /--([a-z0-9-]+):[^;{}]*oklch\(/g;

const strays = [...readFileSync(INDEX_CSS, "utf8").matchAll(COLOUR_DECLARATION)].map(
  ([, name]) => `index.css declares --${name} as a colour; the palette lives in @harpyhare/tokens`,
);

const ownership = {
  ok: strays.length === 0,
  checks: 1,
  failures: strays,
  summary:
    strays.length === 0
      ? "ownership: index.css declares no colour of its own — every token measured above is a token that ships"
      : `ownership: ${strays.length} colour token(s) declared outside the package and measured by nothing`,
};

process.exit(Math.max(report(contrast), report(ownership)));
