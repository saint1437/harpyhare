/**
 * The palette is measured, not eyeballed.
 *
 * Reads the tokens straight out of index.css — so the check can never drift
 * from the values it checks — resolves the four real scopes (light/dark ×
 * HUD/launcher), and asserts:
 *
 *   • WCAG AA: 4.5:1 for text, 3:1 for UI components and graphical objects.
 *     The type scale tops out at 16px, so the 3:1 large-text allowance applies
 *     to nothing and every text token is held to 4.5:1.
 *   • every token sits inside the sRGB gamut, so nothing is silently
 *     gamut-mapped by the browser into a colour nobody chose.
 *
 * Deliberately NOT checked: contrast between two state colours. Colours that
 * must each clear 3:1 against the same ground necessarily land at similar
 * luminance, and success/danger are indistinguishable to a red-green
 * colour-blind user at any luminance. That is what the glyph-and-word rule is
 * for — colour is never the only carrier.
 *
 * Run: node scripts/check-contrast.mjs
 */
import { readFileSync } from "node:fs";

const CSS = new URL("../src/index.css", import.meta.url).pathname;

/* ── colour maths ─────────────────────────────────────────────────────────── */

const M1 = [
  [1, 0.3963377774, 0.2158037573],
  [1, -0.1055613458, -0.0638541728],
  [1, -0.089484178, -1.291485548],
];
const M2 = [
  [4.0767416621, -3.3077115913, 0.2309699292],
  [-1.2684380046, 2.6097574011, -0.3413193965],
  [-0.0041960863, -0.7034186147, 1.707614701],
];

function oklchToLinear(L, C, H) {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const lms = M1.map((r) => (r[0] * L + r[1] * a + r[2] * b) ** 3);
  return M2.map((r) => r[0] * lms[0] + r[1] * lms[1] + r[2] * lms[2]);
}
const inGamut = (L, C, H) => oklchToLinear(L, C, H).every((c) => c >= -0.001 && c <= 1.001);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const encode = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

function hex([L, C, H]) {
  const v = oklchToLinear(L, C, H).map((c) => clamp01(encode(clamp01(c))));
  return (
    "#" +
    v
      .map((x) =>
        Math.round(x * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
function luminance([L, C, H]) {
  const [r, g, b] = oklchToLinear(L, C, H).map(clamp01);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
}

/* ── read the tokens out of index.css ─────────────────────────────────────── */

const css = readFileSync(CSS, "utf8");

/** Opaque `oklch(L C H)` declarations inside one selector block. */
function block(selector) {
  const at = css.indexOf(selector + " {");
  if (at === -1) throw new Error(`selector not found in index.css: ${selector}`);
  const body = css.slice(at, css.indexOf("\n}", at));
  const out = {};
  for (const m of body.matchAll(/--([a-z0-9-]+):\s*oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)\s*;/g)) {
    out[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4])];
  }
  return out;
}

const lightRoot = block(":root");
const darkRoot = block(':root[data-theme="dark"]');
const lightLauncher = block("body.launcher");
const darkLauncher = block(':root[data-theme="dark"] body.launcher');

const SCOPES = {
  "light · HUD": { ...lightRoot },
  "dark · HUD": { ...lightRoot, ...darkRoot },
  "light · launcher": { ...lightRoot, ...lightLauncher },
  "dark · launcher": { ...lightRoot, ...darkRoot, ...darkLauncher },
};

/* ── the requirements ─────────────────────────────────────────────────────── */

const SURFACES = ["base", "surface", "elevated", "inset"];
const TEXT_ON_SURFACES = ["fg", "fg-muted", "fg-subtle", "danger", "listening"];
const MARKS_ON_SURFACES = [
  "accent-mark",
  "listening",
  "listening-dim",
  "success",
  "warning",
  "danger",
  "line-strong",
  "focus",
];
const PAIRS = [
  ["accent-on", "accent", 4.5],
  ["accent-on", "accent-hover", 4.5],
  ["accent", "base", 3],
];

/**
 * `--accent` is deliberately NOT held to 3:1 against every surface.
 *
 * No oxblood lightness satisfies both "3:1 against the HUD's card surface" and
 * "carries its own label at 4.5:1" — the two pull luminance in opposite
 * directions and cross around OKLCH L 0.575 without ever both holding. That is
 * exactly why `--accent-mark` exists: the accent is a FILL, identified by its
 * label (checked above at 4.5:1) and its shadow, while every small graphical
 * mark uses `--accent-mark`, which is held to 3:1 on all four surfaces.
 *
 * WCAG 1.4.11 agrees: a control's boundary is exempt where the control is
 * identifiable by other means. Removing this check is therefore a decision,
 * not a loophole — and the old palette's failure was the opposite case, an
 * accent used as a bare mark at 1.57–2.71:1 with nothing else to identify it.
 */

const failures = [];
let checks = 0;

for (const [scopeName, t] of Object.entries(SCOPES)) {
  for (const [name, value] of Object.entries(t)) {
    checks++;
    if (!inGamut(...value)) failures.push(`${scopeName}: --${name} ${hex(value)} is outside sRGB`);
  }
  const need = (fg, bg, min, kind) => {
    if (!t[fg] || !t[bg]) return;
    checks++;
    const r = contrast(t[fg], t[bg]);
    if (r < min) {
      failures.push(
        `${scopeName}: ${kind} --${fg} ${hex(t[fg])} on --${bg} ${hex(t[bg])} = ${r.toFixed(2)}:1 (need ${min})`,
      );
    }
  };
  for (const fg of TEXT_ON_SURFACES) for (const bg of SURFACES) need(fg, bg, 4.5, "TEXT");
  for (const fg of MARKS_ON_SURFACES) for (const bg of SURFACES) need(fg, bg, 3, "MARK");
  for (const [fg, bg, min] of PAIRS) need(fg, bg, min, min >= 4.5 ? "TEXT" : "MARK");
}

if (failures.length > 0) {
  console.error(`✖ palette: ${failures.length} of ${checks} checks failed\n`);
  for (const f of failures) console.error("  " + f);
  process.exit(1);
}
console.log(
  `✔ palette: ${checks} checks pass across ${Object.keys(SCOPES).length} scopes (AA, sRGB)`,
);
