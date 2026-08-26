import { readFileSync } from "node:fs";

/**
 * The palette is measured, not eyeballed.
 *
 * Reads the tokens straight out of the stylesheet — so the check can never
 * drift from the values it checks — resolves each scope by merging its
 * selectors in cascade order, and asserts:
 *
 *   • WCAG AA: 4.5:1 for text, 3:1 for UI components and graphical objects.
 *   • every token sits inside the sRGB gamut, so nothing is silently
 *     gamut-mapped by the browser into a colour nobody chose.
 *
 * Deliberately NOT checked here: contrast between two state colours. Colours
 * that must each clear 3:1 against the same ground necessarily land at similar
 * luminance, and success/danger are indistinguishable to a red-green
 * colour-blind user at any luminance. That is what a glyph-and-word rule is
 * for — colour is never the only carrier.
 *
 * Nothing in this module knows a palette: the scopes and the requirements are
 * arguments. The desktop app and the landing page have deliberately different
 * palettes (see the monorepo CLAUDE.md) and pass different data in.
 */

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
const GAMUT_EPSILON = 0.001;
const OPAQUE = 1;

function oklchToLinear([L, C, H]) {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const lms = M1.map((row) => (row[0] * L + row[1] * a + row[2] * b) ** 3);
  return M2.map((row) => row[0] * lms[0] + row[1] * lms[1] + row[2] * lms[2]);
}
const inGamut = (colour) =>
  oklchToLinear(colour).every((c) => c >= -GAMUT_EPSILON && c <= 1 + GAMUT_EPSILON);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const encode = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

function hex(colour) {
  const channels = oklchToLinear(colour).map((c) => clamp01(encode(clamp01(c))));
  return `#${channels
    .map((x) =>
      Math.round(x * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

const luminance = (linear) => 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];

/**
 * A token may carry alpha (`oklch(1 0 0 / 12%)`), and the landing page's
 * hairlines and muted text do. Alpha is composited over the ground before the
 * ratio is taken, which is what the browser paints; skipping such tokens — the
 * first version of this check did — quietly left the muted text unmeasured.
 */
function contrast(fg, bg) {
  const ground = oklchToLinear(bg).map(clamp01);
  const front = oklchToLinear(fg).map(clamp01);
  const alpha = fg[3];
  const painted = front.map((c, i) => c * alpha + ground[i] * (1 - alpha));
  const [hi, lo] = [luminance(painted), luminance(ground)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

/* ── reading the stylesheet ───────────────────────────────────────────────── */

/** `--name: oklch(L C H)` or `--name: oklch(L C H / A%)`, one selector block. */
const DECLARATION =
  /--([a-z0-9-]+):\s*oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)%\s*)?\)\s*;/g;

function selectorBlock(css, cssPath, selector) {
  const at = css.indexOf(`${selector} {`);
  if (at === -1) throw new Error(`${cssPath}: selector not found: ${selector}`);
  const body = css.slice(at, css.indexOf("\n}", at));
  const out = {};
  for (const [, name, L, C, H, alpha] of body.matchAll(DECLARATION)) {
    out[name] = [
      Number(L),
      Number(C),
      Number(H),
      alpha === undefined ? OPAQUE : Number(alpha) / 100,
    ];
  }
  return out;
}

/**
 * @param cssPath the stylesheet that declares the palette
 * @param scopes  scope name → the selectors to merge, in cascade order
 * @param pairs   requirements; `fg`/`bg` may be a token name or a list of them
 */
export function checkContrast({ cssPath, scopes, pairs }) {
  const css = readFileSync(cssPath, "utf8");
  const resolved = Object.fromEntries(
    Object.entries(scopes).map(([name, selectors]) => [
      name,
      Object.assign({}, ...selectors.map((selector) => selectorBlock(css, cssPath, selector))),
    ]),
  );

  const failures = [];
  let checks = 0;

  for (const [scope, tokens] of Object.entries(resolved)) {
    for (const [name, value] of Object.entries(tokens)) {
      checks++;
      if (!inGamut(value)) failures.push(`${scope}: --${name} ${hex(value)} is outside sRGB`);
    }
    for (const { fg, bg, min, kind = min >= 4.5 ? "TEXT" : "MARK" } of pairs) {
      for (const front of [fg].flat()) {
        for (const ground of [bg].flat()) {
          checks++;
          // A pair naming a token this scope does not have is a broken pair,
          // not a pair that passes: silently skipping is how a renamed token
          // stops being measured without anything going red.
          if (!tokens[front] || !tokens[ground]) {
            failures.push(
              `${scope}: ${kind} --${front} on --${ground} — ${tokens[front] ? ground : front} is not declared here`,
            );
            continue;
          }
          if (tokens[ground][3] !== OPAQUE) {
            failures.push(
              `${scope}: --${ground} is a translucent ground; contrast against it is undefined`,
            );
            continue;
          }
          const ratio = contrast(tokens[front], tokens[ground]);
          if (ratio < min) {
            failures.push(
              `${scope}: ${kind} --${front} ${hex(tokens[front])} on --${ground} ${hex(tokens[ground])} = ${ratio.toFixed(2)}:1 (need ${min})`,
            );
          }
        }
      }
    }
  }

  const scopeCount = Object.keys(resolved).length;
  return {
    ok: failures.length === 0,
    checks,
    failures,
    summary:
      failures.length === 0
        ? `palette: ${checks} checks pass across ${scopeCount} scopes (AA, sRGB)`
        : `palette: ${failures.length} of ${checks} checks failed`,
  };
}
