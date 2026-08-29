/**
 * The demo's `--app-*` group is a REPLICA of the desktop app's palette, and it
 * is generated here rather than typed.
 *
 * It used to be typed, and the two drifted: the window ground was
 * `oklch(0.28 0.004 285)` against the app's `oklch(0.235 0.005 40)`, the whole
 * replica had slid from a warm hue family to a neutral-blue one, the surfaces
 * were `oklch(1 0 0 / n%)` alpha where the app uses opaque lightness steps, the
 * body/title sizes were half a pixel and a pixel short — and `--app-recording`
 * was RED where the app's `--listening` is deliberately cyan, so the page
 * advertised "recording" in the colour the app spends on "something is wrong".
 * None of that was visible to anything: two palettes, no shared file, no check
 * that could compare them.
 *
 * Now `@harpyhare/tokens/hud.css` is the palette, the desktop imports it, and
 * this script derives the page's copy from the same text. Run it after any
 * change to the package; `--check` fails instead of writing, and runs first in
 * `npm test`, so a stale replica cannot reach a build.
 *
 * WHY GENERATE AT ALL, rather than import the package here too. Two reasons,
 * both structural. The page already owns the names `--fg`, `--surface`,
 * `--border` and `--primary` for its poster palette, so the replica has to live
 * under a prefix. And `scripts/check-contrast.mjs` resolves a scope by merging
 * selector blocks out of ONE stylesheet — a `:root` split across two files
 * would leave the demo scopes measuring nothing while still reporting green.
 * Generated text in `globals.css` keeps both the prefix and the check.
 *
 * WHAT THE PAGE STILL DECIDES FOR ITSELF. The replica is dark-only: it takes
 * the package's `dark · HUD` and `dark · launcher` scopes and never looks at
 * light, which is why the package exposes scopes instead of forcing a theme on
 * anyone. `[data-app-theme="black"]` is a landing-only depth the app has no
 * equivalent of — a visitor toggle for how the mock window reads against the
 * poster ground — and it is derived by dropping BLACK_DELTA of OKLCH lightness
 * off the surface steps and touching nothing else, so hue, chroma, text and
 * marks stay the app's.
 *
 * Run: node scripts/sync-app-tokens.mjs [--check]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { hudBlock, hudScope } from "@harpyhare/tokens";

const GLOBALS = new URL("../src/app/globals.css", import.meta.url);

/** How much OKLCH lightness the `black` theme takes off each surface step. */
const BLACK_DELTA = 0.06;

/**
 * The replica's whole vocabulary: the name the page uses, the Tailwind utility
 * it becomes, and the app token it is a copy of. A `from` the package no longer
 * declares stops this script dead — which is the point of naming them here.
 *
 * `surface: true` marks the depth steps: the five the app's launcher re-bases,
 * and the five the `black` theme shades. Everything else is the same colour at
 * every depth, exactly as in the app.
 */
const REPLICA = [
  { name: "app-bg", utility: "app-bg", from: "--base", surface: true },
  { name: "app-card", utility: "app-card", from: "--surface", surface: true },
  { name: "app-surface", utility: "app-surface", from: "--elevated", surface: true },
  {
    name: "app-surface-active",
    utility: "app-surface-active",
    from: "--surface-active",
    surface: true,
  },
  { name: "app-code", utility: "app-code", from: "--inset", surface: true },
  // Inline code in the demo's prose. The page used to invent a colour of its
  // own here (`oklch(0.8 0.09 18)`), a leftover of the hue family the replica
  // had drifted into; the app highlights the same thing with `--syn-keyword`.
  { name: "app-code-fg", utility: "app-code-fg", from: "--syn-keyword" },
  { name: "app-border", utility: "app-border", from: "--line" },
  { name: "app-fg", utility: "app-fg", from: "--fg" },
  // The variable keeps `-fg`, the utility does not: `text-app-muted` is what
  // sixty-odd call sites already say.
  { name: "app-muted-fg", utility: "app-muted", from: "--fg-muted" },
  { name: "app-primary", utility: "app-primary", from: "--accent" },
  { name: "app-primary-fg", utility: "app-primary-fg", from: "--accent-on" },
  // The mark half of the accent. The app split these two apart because no
  // oxblood lightness can both clear 3:1 on a card and carry its own label at
  // 4.5:1; the demo needs the same split for the same reason.
  { name: "app-primary-mark", utility: "app-primary-mark", from: "--accent-mark" },
  { name: "app-destructive", utility: "app-destructive", from: "--danger" },
  // The app's dark danger is a LIGHT red and carries dark type, which is why
  // this pair exists at all: `text-app-primary-fg` on it would sit at 2:1.
  { name: "app-destructive-fg", utility: "app-destructive-fg", from: "--danger-on" },
  // Cyan, not red. `--listening` means "audio is being captured right now" and
  // is kept off the danger hue on purpose.
  { name: "app-recording", utility: "app-recording", from: "--listening" },
  // The dimmer half of the capture cyan. The app spends it on "armed" — the
  // background buffer is holding audio but nothing is being sent — and the demo
  // needs the same second step, or "standing by" and "recording" collapse into
  // one colour and the orb loses a state.
  { name: "app-recording-dim", utility: "app-recording-dim", from: "--listening-dim" },
  // The third text weight. `--app-muted-fg` was carrying both the app's
  // `--fg-muted` (body prose) and its `--fg-subtle` (captions, hints, the
  // status word when nothing is listening), which flattened a distinction the
  // app makes on nearly every surface.
  { name: "app-subtle-fg", utility: "app-subtle", from: "--fg-subtle" },
  // The hairline that carries structure rather than separation: an `outline`
  // button's border, the orb's ring when it is off, the slider track.
  { name: "app-border-strong", utility: "app-border-strong", from: "--line-strong" },
  // The accent's hover step. Painting hover as `bg-app-primary/90` — what the
  // demo did — lightens the fill over a dark ground, while the app darkens it.
  { name: "app-primary-hover", utility: "app-primary-hover", from: "--accent-hover" },
  // The two remaining state colours. `StateBadge` is the app's universal state
  // atom and it is always colour + glyph + word; without these two the demo can
  // only say "fine" and "broken".
  { name: "app-success", utility: "app-success", from: "--success" },
  { name: "app-warning", utility: "app-warning", from: "--warning" },
  // The focus ring. The app draws focus as an `outline`, never a `ring` —
  // rings are clipped by the `overflow-hidden` every card carries — and the
  // demo had no focus-visible styling at all, which is a keyboard trap in a
  // widget that now owns arrow keys and Escape.
  { name: "app-focus", utility: "app-focus", from: "--focus" },
  // The two scrims. `--overlay` grounds the teleprompter and the dialogs;
  // `--scrim-chip` is the disc a remove-X sits on over a thumbnail, and it
  // carries `--on-scrim` rather than `--app-fg` because it is painted over
  // arbitrary image content.
  { name: "app-overlay", utility: "app-overlay", from: "--overlay" },
  { name: "app-scrim", utility: "app-scrim", from: "--scrim-chip" },
  { name: "app-on-scrim", utility: "app-on-scrim", from: "--on-scrim" },
];

/** The type scale, same idea: the page's name, the app's token. */
const TYPE = [
  { name: "text-app-hint", from: "--hud-text-hint" },
  { name: "text-app-caption", from: "--hud-text-caption" },
  { name: "text-app-body", from: "--hud-text-body" },
  // The app lets the user move this one at runtime; the demo takes its default.
  { name: "text-app-chat", from: "--chat-font-size" },
  { name: "text-app-title", from: "--hud-text-title" },
  // The onboarding heading and the orb's big `⌘R` chip. Only the demo's
  // largest surfaces use it, which is why it was possible to omit it before
  // there were any.
  { name: "text-app-display", from: "--hud-text-display" },
];

const HUD = hudScope("dark · HUD");
const LAUNCHER = hudBlock("launcherDark");
const TEXT = hudBlock("light");

function value(tokens, from) {
  const found = tokens[from];
  if (found === undefined) throw new Error(`@harpyhare/tokens no longer declares \`${from}\``);
  return found;
}

/**
 * One depth step down, in OKLCH lightness. Only the `black` theme uses it, and
 * only on surfaces: shading a text or mark colour would move it off the
 * contrast the app measured it at.
 */
function shade(colour) {
  const parsed = /^oklch\(\s*([\d.]+)(\s.*)\)$/.exec(colour);
  if (!parsed) throw new Error(`cannot shade a colour that is not plain oklch(): ${colour}`);
  const lightness = Math.max(0, Number(parsed[1]) - BLACK_DELTA);
  return `oklch(${String(Number(lightness.toFixed(4)))}${parsed[2] ?? ""})`;
}

const declaration = (name, text) => `  --${name}: ${text};`;

/** The `--app-*` values themselves, the app's dark HUD under the page's names. */
const values = REPLICA.map((token) => declaration(token.name, value(HUD, token.from)));

/**
 * The three local overrides, in the order the cascade needs them: `.app-launcher`
 * and `[data-app-theme="black"]` score the same, so the second only wins because
 * it comes second, and the pair selector that beats both comes last.
 */
const surfaces = REPLICA.filter((token) => token.surface);
const rules = [
  {
    selector: ".app-launcher",
    comment:
      "the launcher window sits a step deeper than the HUD — the app's own seam,\n   `body.launcher`, which re-bases the surface steps and nothing else",
    body: surfaces
      .filter((token) => LAUNCHER[token.from] !== undefined)
      .map((token) => declaration(token.name, value(LAUNCHER, token.from))),
  },
  {
    selector: '[data-app-theme="black"]',
    comment: `a landing-only depth: the same palette with ${String(BLACK_DELTA)} of OKLCH lightness\n   off the surface steps, so the demo can be read against the poster ground`,
    body: surfaces.map((token) => declaration(token.name, shade(value(HUD, token.from)))),
  },
  {
    selector: '[data-app-theme="black"] .app-launcher',
    comment: "both at once",
    body: surfaces
      .filter((token) => LAUNCHER[token.from] !== undefined)
      .map((token) => declaration(token.name, shade(value(LAUNCHER, token.from)))),
  },
];

const scopes = rules.map(
  ({ selector, comment, body }) => `/* ${comment} */\n${selector} {\n${body.join("\n")}\n}`,
);

/** What Tailwind is told about all of it. */
const theme = [
  ...REPLICA.map((token) => declaration(`color-${token.utility}`, `var(--${token.name})`)),
  ...TYPE.map((token) => declaration(token.name, value(TEXT, token.from))),
];

const REGIONS = {
  "app-replica:values": values.join("\n"),
  "app-replica:scopes": scopes.join("\n\n"),
  "app-replica:theme": theme.join("\n"),
};

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const marker = (name, edge) => `/* ${name} ${edge} */`;

/**
 * Rewrites the three marked regions in place. The opening marker's own
 * indentation is kept and reused for the closing one: two of the regions sit
 * inside a rule, where prettier indents a comment by two spaces, and a marker
 * that came back at column 0 would fail `prettier --check` rather than the
 * palette.
 */
function withRegions(css) {
  let out = css;
  for (const [name, body] of Object.entries(REGIONS)) {
    const open = marker(name, "↓ generated by scripts/sync-app-tokens.mjs — do not edit");
    const close = marker(name, "↑");
    const region = new RegExp(
      `^([ \\t]*)${escape(open)}\\n[\\s\\S]*?\\n[ \\t]*${escape(close)}`,
      "m",
    );
    const found = region.exec(out);
    if (!found) throw new Error(`globals.css: no \`${name}\` region`);
    const indent = found[1] ?? "";
    out = out.replace(region, () => `${indent}${open}\n${body}\n${indent}${close}`);
  }
  return out;
}

const current = readFileSync(GLOBALS, "utf8");
const next = withRegions(current);
const checking = process.argv.includes("--check");

if (current === next) {
  console.log(
    `✔ app replica: ${String(REPLICA.length)} colours and ${String(TYPE.length)} sizes match @harpyhare/tokens`,
  );
  process.exit(0);
}
if (checking) {
  console.error(
    "✖ app replica: globals.css is stale — the palette moved under it.\n\n  Run `node scripts/sync-app-tokens.mjs` and commit the result.",
  );
  process.exit(1);
}
writeFileSync(GLOBALS, next);
console.log("✔ app replica: globals.css rewritten from @harpyhare/tokens");
