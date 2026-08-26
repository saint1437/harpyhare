import { en } from "./en";
import { ru } from "./ru";
import { FALLBACK_LOCALE, LANGUAGE_SYSTEM, LOCALES, type Dictionary, type Locale } from "./types";

export { format } from "./format";
export { LANGUAGES, LANGUAGE_SYSTEM, LOCALES } from "./types";
export type { Dictionary, Language, Locale } from "./types";

const DICTIONARIES: Record<Locale, Dictionary> = { ru, en };

export function dictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale];
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
 * It starts on the SOURCE locale rather than on `navigator.language`. A window
 * calls `applyLanguage` before it mounts (`render-root.tsx`), so a real user
 * never sees the difference; what the default buys is that a unit test of a pure
 * module gets the source strings unless it asks for otherwise.
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
 * happens on every adoption so the guess self-corrects.
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

/**
 * Adopts the stored `Settings.language`, resolving `system` against the browser.
 * A no-op when the locale is unchanged — an equal-but-republished snapshot would
 * wake every subscriber in both windows for nothing.
 */
export function applyLanguage(
  // `string` and not `Language`: the value comes off disk through
  // `Settings.language`, where Rust types it as a plain string, and
  // `resolveLocale` is the thing that decides what an unknown value means.
  language: string = rememberedLocale() ?? LANGUAGE_SYSTEM,
  navigatorLanguage: string = navigator.language,
): Locale {
  const next = resolveLocale(language, navigatorLanguage);
  remember(next);
  if (next === currentLocale) return next;
  currentLocale = next;
  current = DICTIONARIES[next];
  listeners.forEach((listener) => {
    listener();
  });
  return next;
}
