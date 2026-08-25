/**
 * Every colour utility in the source must resolve to a token declared in
 * index.css's `@theme inline`.
 *
 * Why this exists: a Tailwind class that names a token which does not exist is
 * not an error anywhere — Tailwind simply generates nothing and the element
 * renders unstyled. Neither `tsc` nor eslint can see it, and in a two-window
 * Tauri app you would only find it by opening the window it lives in. This
 * check is the reason a palette rename is safe to do mechanically.
 *
 * Run: node scripts/check-tokens.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const SRC = new URL("../src/", import.meta.url).pathname;
const CSS = join(SRC, "index.css");
const SKIP_FILES = new Set(["bindings.ts"]);

/** Utility prefixes whose value is a colour token. */
const COLOUR_PREFIXES = [
  "bg",
  "text",
  "border",
  "ring",
  "fill",
  "stroke",
  "divide",
  "outline",
  "caret",
  "decoration",
  "shadow",
  "from",
  "via",
  "to",
];

/** Non-colour utilities that share a colour prefix and must not be flagged. */
const NOT_COLOURS = new Set([
  // text-* sizing / alignment / wrapping
  "text-hint",
  "text-caption",
  "text-body",
  "text-title",
  "text-display",
  "text-chat",
  "text-left",
  "text-right",
  "text-center",
  "text-justify",
  "text-start",
  "text-end",
  "text-balance",
  "text-pretty",
  "text-wrap",
  "text-nowrap",
  "text-clip",
  "text-ellipsis",
  // border/divide/ring/outline structural
  "border",
  "border-0",
  "border-2",
  "border-4",
  "border-t",
  "border-r",
  "border-b",
  "border-l",
  "border-x",
  "border-y",
  "border-solid",
  "border-dashed",
  "border-dotted",
  "border-none",
  "border-collapse",
  "border-separate",
  "border-transparent",
  "border-current",
  "divide-y",
  "divide-x",
  "divide-y-0",
  "divide-x-0",
  "ring",
  "ring-0",
  "ring-1",
  "ring-2",
  "ring-4",
  "ring-8",
  "ring-inset",
  "ring-transparent",
  "outline",
  "outline-0",
  "outline-1",
  "outline-2",
  "outline-4",
  "outline-none",
  "outline-hidden",
  "outline-offset-0",
  "outline-offset-1",
  "outline-offset-2",
  "outline-offset-4",
  "outline-solid",
  "outline-dashed",
  "outline-dotted",
  "bg-transparent",
  "bg-current",
  "bg-none",
  "bg-cover",
  "bg-contain",
  "bg-center",
  "bg-clip-text",
  "fill-none",
  "fill-current",
  "stroke-current",
  "stroke-none",
  "shadow-none",
  "shadow-xs",
  "shadow-sm",
  "shadow-md",
  "shadow-lg",
  "decoration-solid",
  "decoration-dashed",
  "decoration-dotted",
  "decoration-none",
]);

/** tw-animate-css direction keywords, e.g. `slide-in-from-bottom-1`. */
const ANIMATE_DIRECTION = /^(from|to)-(top|bottom|left|right)(-|$)/;

/** `border-l-transparent`, `border-t-current` — a side, not a colour token. */
const SIDED_NEUTRAL = /^border-[trblxy]-(transparent|current|inherit)$/;

function declaredTokens() {
  const css = readFileSync(CSS, "utf8");
  const theme = css.slice(css.indexOf("@theme inline"));
  const colours = new Set();
  const shadows = new Set();
  for (const m of theme.matchAll(/--color-([a-z0-9-]+):/g)) colours.add(m[1]);
  for (const m of theme.matchAll(/--shadow-([a-z0-9-]+):/g)) shadows.add(m[1]);
  return { colours, shadows };
}

function sourceFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p));
    else if ([".ts", ".tsx"].includes(extname(name)) && !SKIP_FILES.has(name)) out.push(p);
  }
  return out;
}

const { colours, shadows } = declaredTokens();
const classRe = new RegExp(
  String.raw`(?<![\w-])(?:[a-z-]+:)*(${COLOUR_PREFIXES.join("|")})-([a-z0-9-]+?)(?:\/\d+)?(?![\w-])`,
  "g",
);

const problems = [];
for (const file of sourceFiles(SRC)) {
  const text = readFileSync(file, "utf8");
  // Arbitrary values carry CSS property names (`transition-[…,border-color]`)
  // that look exactly like utilities. They are not classes; strip them first.
  text.split("\n").forEach((line, i) => {
    for (const m of line.replace(/\[[^\]]*\]/g, "[]").matchAll(classRe)) {
      const [full, prefix, name] = m;
      const bare = `${prefix}-${name}`;
      if (NOT_COLOURS.has(bare) || ANIMATE_DIRECTION.test(bare) || SIDED_NEUTRAL.test(bare))
        continue;
      const known = prefix === "shadow" ? shadows.has(name) : colours.has(name);
      if (!known) {
        problems.push(`${file.replace(SRC, "src/")}:${i + 1}  ${full}  →  no --color-${name}`);
      }
    }
  });
}

if (problems.length > 0) {
  console.error(`✖ ${problems.length} colour utilities do not resolve to a token:\n`);
  for (const p of problems) console.error("  " + p);
  process.exit(1);
}
console.log(
  `✔ every colour utility resolves (${colours.size} colour tokens, ${shadows.size} shadows)`,
);
