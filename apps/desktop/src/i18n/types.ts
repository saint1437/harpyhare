import type { CommonCopy } from "./common-types";
import type { ErrorsCopy } from "./errors-types";
import type { HotkeysCopy } from "./hotkeys-types";
import type { HudCopy } from "./hud-types";
import type { LauncherCopy } from "./launcher-types";
import type { OnboardingCopy } from "./onboarding-types";
import type { SettingsCopy } from "./settings-types";

/**
 * The two languages the interface exists in. `ru` is the source — every string
 * is written there first — and `en` is held to it BY THE COMPILER: both are
 * declared `Dictionary`, so a key added to one and forgotten in the other is a
 * `tsc` failure rather than a blank on screen. This is the pattern
 * `apps/landing/src/i18n` already uses, down to the `<namespace>-types.ts` /
 * `<namespace>-ru.ts` / `<namespace>-en.ts` split it introduced for its demo
 * copy; here that split is what keeps one 1500-line file from being the place
 * every change collides.
 */
export const LOCALES = ["ru", "en"] as const;

export type Locale = (typeof LOCALES)[number];

/**
 * What `Settings.language` may hold — the mirror of `Settings.theme`, one axis
 * over, and resolved the same way: `system` is answered HERE, on the frontend,
 * never by Rust. Asking Rust would make `bindings.ts` depend on the build host
 * (see the identical-bindings invariant in CLAUDE.md), which is exactly why
 * `lib/platform.ts` reads `navigator.userAgent` instead of a Rust constant.
 */
export const LANGUAGES = ["system", "ru", "en"] as const;

export type Language = (typeof LANGUAGES)[number];

export const LANGUAGE_SYSTEM: Language = "system";

/**
 * Where an OS language that is neither Russian nor English lands.
 *
 * English, not the source language: the choice is between two languages the
 * reader may not have asked for, and someone whose system is set to French or
 * Polish is far likelier to read English than Russian. A `ru*` system gets
 * Russian by the rule below; nobody else is guessed at.
 */
export const FALLBACK_LOCALE: Locale = "en";

export interface Dictionary {
  locale: Locale;
  common: CommonCopy;
  errors: ErrorsCopy;
  hotkeys: HotkeysCopy;
  launcher: LauncherCopy;
  settings: SettingsCopy;
  hud: HudCopy;
  onboarding: OnboardingCopy;
}
