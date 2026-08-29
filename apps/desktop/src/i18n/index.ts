import { ru } from "./ru";
import { FALLBACK_LOCALE, LANGUAGE_SYSTEM, LOCALES, type Dictionary, type Locale } from "./types";

export { format } from "./format";
export { LANGUAGES, LANGUAGE_SYSTEM, LOCALES } from "./types";
export type { Dictionary, Language, Locale } from "./types";

/* ── which locales are in the bundle, and which are fetched ───────────────── */

/**
 * Only the SOURCE locale is in the eager bundle; every other one is a chunk of
 * its own, fetched by the window's boot before anything renders.
 *
 * Both windows `modulepreload` `render-root`, so a statically imported
 * dictionary is parsed twice at start — once per window — by a reader who will
 * only ever see one of the two languages. `en` alone was 33 kB of source that a
 * Russian UI never reads.
 *
 * Keeping ONE locale static is what lets every reader stay synchronous: this
 * record is never empty, `getDict()` can never answer `undefined`, and the async
 * path only ever UPGRADES to the other language. It also decides what a unit
 * test of a pure module gets unless it asks for otherwise — the source strings.
 */
const DICTIONARIES: Partial<Record<Locale, Dictionary>> = { [ru.locale]: ru };

/**
 * A record of literal specifiers, and not one `import()` over a built path: a
 * computed specifier gives the bundler no way to know which files it may have to
 * split, and it puts every locale back into one chunk. The record is exhaustive
 * over `Locale` by the compiler, so a third language cannot be added without
 * saying how it is loaded.
 */
const LOADERS: Record<Locale, () => Promise<Dictionary>> = {
  // The source locale is already in `DICTIONARIES` and this branch is never
  // reached; it exists so the record can stay exhaustive.
  ru: () => Promise.resolve(ru),
  en: async () => (await import("./en")).en,
};

/**
 * The dictionary of a locale that is already loaded, synchronously.
 *
 * Asking for one that is not is a programming error and says so: `lib/` and
 * every component read copy without a hook, a context or a loading state, and
 * the price of that is that somebody must have awaited `loadLanguage` first.
 * Nothing in the app calls this — `getDict()` is the app's door — but the suite
 * reads both locales through it, and `src/test-setup.ts` preloads them for it.
 */
export function dictionary(locale: Locale): Dictionary {
  const loaded = DICTIONARIES[locale];
  if (loaded === undefined) throw new Error(`Dictionary "${locale}" is not loaded`);
  return loaded;
}

const KNOWN_LOCALES: ReadonlySet<string> = new Set(LOCALES);

/** `ru-RU`, `en-GB`, `ru` — the primary subtag is the whole of the answer. */
const PRIMARY_SUBTAG_SEPARATOR = "-";

function primarySubtag(tag: string): string {
  return tag.trim().toLowerCase().split(PRIMARY_SUBTAG_SEPARATOR)[0] ?? "";
}

/**
 * `system` is answered HERE, from `navigator.language`, exactly as the platform
 * is answered from `navigator.userAgent` in `lib/platform.ts` — and for the same
 * reason. A value that came from Rust would depend on `#[cfg]` or on the machine
 * and would split `bindings.ts` between the macOS and Windows build hosts, which
 * is an invariant of this repository (see CLAUDE.md).
 *
 * An OS set to neither language lands on `FALLBACK_LOCALE`; see the note there
 * for why that is English and not the source language.
 */
export function resolveLocale(language: string, navigatorLanguage: string): Locale {
  if (KNOWN_LOCALES.has(language)) return language as Locale;
  const subtag = primarySubtag(navigatorLanguage);
  return KNOWN_LOCALES.has(subtag) ? (subtag as Locale) : FALLBACK_LOCALE;
}

/* ── the current dictionary ───────────────────────────────────────────────── */

/**
 * A module singleton, on the pattern `lib/notifications` already set: the two
 * windows are two React roots that share no state, so module scope IS per-window
 * state — and the framework-free half of the app (`lib/`) can read the current
 * dictionary without a hook or a context threaded through it.
 *
 * It starts on the SOURCE locale, which is also the only one that is loaded
 * before anything asks. A window calls `adoptLanguage` before it mounts
 * (`render-root.tsx`), so a real user never sees the difference.
 */
let currentLocale: Locale = ru.locale;
let current: Dictionary = ru;
const listeners = new Set<() => void>();

export function getDict(): Dictionary {
  return current;
}

export function getLocale(): Locale {
  return currentLocale;
}

export function subscribeDictionary(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The locale this window used last time, so a boot does not start in the wrong
 * language.
 *
 * `settings.json` has the last word, but it arrives an IPC round trip after the
 * first frame. Falling back to `navigator.language` in the meantime is right
 * only while the two agree: on a machine whose OS is English and whose app is
 * set to Russian, every HUD open — and the HUD is created on demand, so that is
 * often — flashed English before settling. Observed, not theorised.
 *
 * `localStorage` is per-window-origin and survives a restart, which is exactly
 * the shape of the question. It is a guess, never an authority: a wrong or
 * cleared value costs the same round trip we already pay, and the write below
 * happens on every adoption so the guess self-corrects. Now that a locale can
 * be a separate chunk, it is also what the boot fetches — a wrong guess costs
 * one more import when the settings arrive, not a frame in the wrong language.
 */
const REMEMBERED_LOCALE_KEY = "harpyhare.locale";

function rememberedLocale(): string | null {
  try {
    return localStorage.getItem(REMEMBERED_LOCALE_KEY);
  } catch {
    // Private windows and blocked site data throw on access, not on read.
    return null;
  }
}

function remember(locale: Locale): void {
  try {
    localStorage.setItem(REMEMBERED_LOCALE_KEY, locale);
  } catch {
    // Nothing to do and nothing to report: the next boot just guesses again.
  }
}

/** What a caller that names no language is asking for. */
function preferredLanguage(): string {
  return rememberedLocale() ?? LANGUAGE_SYSTEM;
}

/**
 * Makes sure the dictionary for `language` is in memory, and answers which
 * locale that was. Does NOT switch — that is `applyLanguage`, and keeping the
 * two apart is the whole design.
 *
 * The asynchrony of a split bundle lives here and nowhere else. Every path that
 * can reach a locale this window has never shown awaits this FIRST and swaps
 * after: the window's boot (`render-root.tsx`), the settings row
 * (`settings-registry.ts`, through `adoptLanguage`) and the two places that
 * adopt a `Settings` snapshot (`state/settings.ts`). What that buys is that the
 * swap itself stays synchronous — no component needs a loading state, and no
 * frame is ever rendered against a dictionary that has not arrived.
 *
 * It never rejects. A chunk that will not load must not take the settings down
 * with it: the `applyLanguage` that follows finds nothing, keeps the dictionary
 * it has, and the window stays readable in the language it already had.
 */
export async function loadLanguage(
  language: string = preferredLanguage(),
  navigatorLanguage: string = navigator.language,
): Promise<Locale> {
  const next = resolveLocale(language, navigatorLanguage);
  if (DICTIONARIES[next] === undefined) {
    try {
      DICTIONARIES[next] = await LOADERS[next]();
    } catch {
      // Swallowed on purpose. There is no dictionary in which to write the
      // apology, and the caller's `applyLanguage` reports it the only way that
      // helps: by leaving the window in a language it can read.
    }
  }
  return next;
}

/**
 * Adopts the stored `Settings.language`, resolving `system` against the browser.
 * A no-op when the locale is unchanged — an equal-but-republished snapshot would
 * wake every subscriber in both windows for nothing.
 *
 * **Synchronous, and that is load-bearing.** It is called from inside
 * `state/settings.adopt`, i.e. inside a store publish: a dictionary that landed
 * one tick after the settings snapshot would put a frame of the old language on
 * screen under the new settings — the wrong-language flash this module already
 * fixed once, from the other end. Hence the split with `loadLanguage`: callers
 * that might be asking for an unloaded locale await it and only then come here.
 *
 * The missing-dictionary branch below is therefore unreachable on every path the
 * app has, and is a refusal rather than a repair: switching to a dictionary that
 * is not there would blank the interface, while keeping the current one leaves
 * it readable and the next `adopt` (or the next boot, which loads what
 * `remember` wrote) tries again.
 */
export function applyLanguage(
  // `string` and not `Language`: the value comes off disk through
  // `Settings.language`, where Rust types it as a plain string, and
  // `resolveLocale` is the thing that decides what an unknown value means.
  language: string = preferredLanguage(),
  navigatorLanguage: string = navigator.language,
): Locale {
  const next = resolveLocale(language, navigatorLanguage);
  remember(next);
  if (next === currentLocale) return next;
  const loaded = DICTIONARIES[next];
  if (loaded === undefined) return currentLocale;
  currentLocale = next;
  current = loaded;
  listeners.forEach((listener) => {
    listener();
  });
  return next;
}

/**
 * `loadLanguage` then `applyLanguage`, for the two callers that may be naming a
 * language this window has never shown: the window's boot and the settings row.
 * Everything between the fetch and the swap is one microtask with nothing
 * rendered in it.
 */
export async function adoptLanguage(
  language?: string,
  navigatorLanguage?: string,
): Promise<Locale> {
  return applyLanguage(await loadLanguage(language, navigatorLanguage), navigatorLanguage);
}
