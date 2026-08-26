import { globSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

/**
 * Every colour utility in the source must resolve to a token the CSS declares.
 *
 * Why this exists: a Tailwind class naming a token that does not exist is not
 * an error anywhere. Tailwind simply generates nothing, the element renders
 * unstyled, and neither `tsc` nor eslint nor the bundler says a word — in the
 * desktop app you would only find it by opening the window it lives in, on the
 * landing page only on one breakpoint of one section. This check is the reason
 * a palette rename is safe to do mechanically.
 *
 * The mechanic was written twice (`apps/desktop/scripts/check-tokens.mjs` and
 * `apps/landing/scripts/check-tokens.mjs`, both saying so in their headers) and
 * lives here once. What differs between the two apps is DATA, not mechanism:
 * the CSS file, the source tree, and a handful of project-specific class names.
 * The palettes themselves are deliberately different and this module never
 * assumes either of them.
 */

const THEME_AT_RULE = "@theme inline";

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

/**
 * Utilities that share a prefix with a colour but name no token. Everything
 * here is a Tailwind built-in — a project's own non-colour classes belong in
 * `extraClasses`, and its own tokens are read out of the CSS instead.
 */
const NOT_COLOUR_UTILITIES = new Set([
  // text-* — Tailwind's own sizes, plus alignment and wrapping
  "text-xs",
  "text-sm",
  "text-base",
  "text-lg",
  "text-xl",
  "text-2xl",
  "text-3xl",
  "text-4xl",
  "text-5xl",
  "text-6xl",
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
  "border-t-2",
  "border-b-2",
  "border-solid",
  "border-dashed",
  "border-dotted",
  "border-none",
  "border-collapse",
  "border-separate",
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
  "bg-none",
  "bg-cover",
  "bg-contain",
  "bg-center",
  "bg-repeat",
  "bg-clip-text",
  "fill-none",
  "stroke-none",
  "shadow-none",
  "shadow-xs",
  "shadow-sm",
  "shadow-md",
  "shadow-lg",
  "shadow-xl",
  "decoration-solid",
  "decoration-dashed",
  "decoration-dotted",
  "decoration-none",
]);

/** The three keywords every colour utility accepts, on every colour prefix. */
const COLOUR_KEYWORDS = ["transparent", "current", "inherit"];

/** tw-animate-css direction keywords, e.g. `slide-in-from-bottom-1`. */
const ANIMATE_DIRECTION = /^(from|to)-(top|bottom|left|right)(-|$)/;

/** `border-l-transparent`, `border-t-current` — a side, not a colour token. */
const SIDED_NEUTRAL = new RegExp(`^border-[trblxy]-(${COLOUR_KEYWORDS.join("|")})$`);

/**
 * The trailing `[` in the lookahead is what keeps `border-t-[1.5px]` from being
 * read as a colour named `t-` once the arbitrary value has been blanked out.
 */
const classPattern = () =>
  new RegExp(
    String.raw`(?<![\w-])(?:[a-z-]+:)*(${COLOUR_PREFIXES.join("|")})-([a-z0-9-]+?)(?:\/\d+)?(?![\w\-[])`,
    "g",
  );

/**
 * Prose in a comment reads exactly like a class name ("… would file `text-chat`
 * under text-colour …"), so comments are blanked before the scan. Block
 * comments keep their newlines so the reported line numbers still point at the
 * right line.
 */
function withoutComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
    .replace(/(?<!:)\/\/.*$/gm, "");
}

function declaredTokens(cssPath) {
  const css = readFileSync(cssPath, "utf8");
  const themeAt = css.indexOf(THEME_AT_RULE);
  if (themeAt === -1) throw new Error(`${cssPath}: no \`${THEME_AT_RULE}\` block`);
  const theme = css.slice(themeAt);
  const namespace = (kind) =>
    new Set(
      [...theme.matchAll(new RegExp(String.raw`--${kind}-([a-z0-9-]+):`, "g"))].map(([, n]) => n),
    );
  return {
    colours: namespace("color"),
    fontSizes: namespace("text"),
    fonts: namespace("font"),
    shadows: namespace("shadow"),
    // Classes written by hand outside the theme: .shadow-poster, .text-stroke, …
    plain: new Set([...css.matchAll(/\.([a-z][a-z0-9-]*)/g)].map(([, name]) => name)),
  };
}

/**
 * @param cssPath      the stylesheet that declares the palette
 * @param srcRoot      directory the globs and the reported paths are relative to
 * @param srcGlobs     what counts as source; defaults to the TS/TSX tree
 * @param skipFiles    base names to leave out (generated files, fixtures)
 * @param extraClasses project-specific non-colour utilities
 */
export function checkTokens({
  cssPath,
  srcRoot,
  srcGlobs = ["**/*.ts", "**/*.tsx"],
  skipFiles = [],
  extraClasses = [],
}) {
  const { colours, fontSizes, fonts, shadows, plain } = declaredTokens(cssPath);
  const notColours = new Set([...NOT_COLOUR_UTILITIES, ...extraClasses]);
  const files = globSync(srcGlobs, {
    cwd: srcRoot,
    exclude: (path) => skipFiles.includes(basename(path)),
  }).sort();

  const failures = [];
  let checks = 0;
  for (const file of files) {
    const text = withoutComments(readFileSync(join(srcRoot, file), "utf8"));
    text.split("\n").forEach((line, index) => {
      // Arbitrary values carry CSS property names (`transition-[…,border-color]`,
      // `shadow-[8px_8px_0_var(--bg)]`) that look exactly like utilities. They
      // are not classes; strip them first.
      for (const [full, prefix, name] of line
        .replace(/\[[^\]]*\]/g, "[]")
        .matchAll(classPattern())) {
        const bare = `${prefix}-${name}`;
        if (
          notColours.has(bare) ||
          plain.has(bare) ||
          COLOUR_KEYWORDS.includes(name) ||
          ANIMATE_DIRECTION.test(bare) ||
          SIDED_NEUTRAL.test(bare)
        ) {
          continue;
        }
        checks++;
        // `text-` is overloaded: a colour, a --text-* size, or a font family.
        // `shadow-` is a --shadow-* token or, per Tailwind, a colour.
        const known =
          prefix === "text"
            ? colours.has(name) || fontSizes.has(name) || fonts.has(name)
            : prefix === "shadow"
              ? shadows.has(name) || colours.has(name)
              : colours.has(name);
        if (!known) failures.push(`${file}:${index + 1}  ${full}  →  no --color-${name}`);
      }
    });
  }

  return {
    ok: failures.length === 0,
    checks,
    failures,
    summary:
      failures.length === 0
        ? `tokens: ${checks} colour utilities resolve (${colours.size} colours, ${fontSizes.size} sizes, ${shadows.size} shadows, ${plain.size} hand-written classes, ${files.length} files)`
        : `tokens: ${failures.length} of ${checks} colour utilities do not resolve to a declared token`,
  };
}
