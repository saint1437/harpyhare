import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Reading `hud.css` back out as data.
 *
 * The palette is authored as CSS because CSS is what the desktop actually
 * paints with — a JSON source would have to be compiled into a stylesheet, and
 * then the file that ships would be a build artefact nobody reads. Everything
 * that is not the desktop needs the same values in some other shape, and this
 * module is the one place that turns the stylesheet back into values:
 *
 *   • `apps/landing/scripts/sync-app-tokens.mjs` generates the landing's
 *     `--app-*` replica out of it;
 *   • `hud.test.ts` asserts the two dark arms of the file are identical, which
 *     is the only thing standing between them and a silent drift.
 *
 * This module knows the SHAPE of the layer (which selectors exist, which of
 * them are the same theme under a different trigger) and nothing about what any
 * consumer intends to do with it.
 */

const HUD_CSS_URL = new URL("./hud.css", import.meta.url);

/** The path of the stylesheet itself — what a check script passes as `cssPath`. */
export const HUD_CSS_PATH = fileURLToPath(HUD_CSS_URL);

/** Every block the file declares, by the name this package calls it. */
export const HUD_SELECTORS = {
  light: ":root",
  dark: ':root[data-theme="dark"]',
  /** The same values as `dark`, triggered by the OS instead of the attribute. */
  darkSystem: ':root:not([data-theme="light"])',
  launcherLight: "body.launcher",
  launcherDark: ':root[data-theme="dark"] body.launcher',
  launcherDarkSystem: ':root:not([data-theme="light"]) body.launcher',
};

/**
 * The scopes a browser can actually be in, each as the selectors that stack up
 * to make it, in cascade order. This is what `checkContrast` takes as `scopes`,
 * and it lives here rather than in the desktop's check script so that adding a
 * block to the stylesheet and forgetting to measure it stays impossible.
 *
 * Six, not four: the OS-triggered dark arms are separate scopes because they
 * are separate text in the file, and text that nothing measures is text that
 * drifts.
 */
export const HUD_SCOPES = {
  "light · HUD": [HUD_SELECTORS.light],
  "dark · HUD": [HUD_SELECTORS.light, HUD_SELECTORS.dark],
  "dark · HUD · system": [HUD_SELECTORS.light, HUD_SELECTORS.darkSystem],
  "light · launcher": [HUD_SELECTORS.light, HUD_SELECTORS.launcherLight],
  "dark · launcher": [HUD_SELECTORS.light, HUD_SELECTORS.dark, HUD_SELECTORS.launcherDark],
  "dark · launcher · system": [
    HUD_SELECTORS.light,
    HUD_SELECTORS.darkSystem,
    HUD_SELECTORS.launcherDarkSystem,
  ],
};

/** The two pairs of blocks that must stay identical: [OS-triggered, forced]. */
export const HUD_DARK_ARMS = [
  ["darkSystem", "dark"],
  ["launcherDarkSystem", "launcherDark"],
];

const withoutComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const escapeForRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

let cached;
function stylesheet() {
  cached ??= withoutComments(readFileSync(HUD_CSS_URL, "utf8"));
  return cached;
}

/**
 * The body of one rule. The selector has to start its line: `body.launcher` is
 * a substring of `:root[data-theme="dark"] body.launcher`, and matching that by
 * accident would make the launcher's own block invisible.
 */
function ruleBody(css, selector) {
  const opening = new RegExp(String.raw`^[ \t]*${escapeForRegExp(selector)}[ \t]*\{`, "m");
  const found = opening.exec(css);
  if (!found) throw new Error(`hud.css: no rule for \`${selector}\``);
  let depth = 0;
  for (let i = found.index + found[0].length - 1; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) {
      return css.slice(found.index + found[0].length, i);
    }
  }
  throw new Error(`hud.css: unterminated rule for \`${selector}\``);
}

/**
 * Every `--name: value` of one block, in file order, duplicates included.
 * Values keep their text and lose only their line breaks, so a multi-line
 * shadow compares equal to the same shadow wrapped differently.
 */
export function hudDeclarationList(block) {
  const selector = HUD_SELECTORS[block];
  if (!selector) throw new Error(`hud.css: no block named \`${block}\``);
  return ruleBody(stylesheet(), selector)
    .split(";")
    .map((declaration) => /^\s*(--[a-z0-9-]+)\s*:\s*([\s\S]+)$/.exec(declaration))
    .filter((parts) => parts !== null)
    .map(([, name, value]) => [name, value.replace(/\s+/g, " ").trim()]);
}

/** The same, as a lookup. A later declaration wins, exactly as in a browser. */
export function hudBlock(block) {
  return Object.fromEntries(hudDeclarationList(block));
}

/**
 * One scope of `HUD_SCOPES`, resolved: its selectors merged in cascade order.
 * `--processing: var(--fg-muted)` survives as written — a consumer that needs
 * a colour out of it has to say what it means by that.
 */
export function hudScope(scope) {
  const selectors = HUD_SCOPES[scope];
  if (!selectors) throw new Error(`hud.css: no scope named \`${scope}\``);
  const byName = Object.fromEntries(
    Object.entries(HUD_SELECTORS).map(([block, selector]) => [selector, block]),
  );
  return Object.assign({}, ...selectors.map((selector) => hudBlock(byName[selector])));
}
