import { commonEn } from "./common-en";
import { errorsEn } from "./errors-en";
import { hotkeysEn } from "./hotkeys-en";
import { hudEn } from "./hud-en";
import { launcherEn } from "./launcher-en";
import { onboardingEn } from "./onboarding-en";
import { settingsEn } from "./settings-en";
import type { Dictionary } from "./types";

/**
 * Held to `ru` by the compiler, not by discipline: both are declared
 * `Dictionary`, so a key added to one and missed here fails `tsc`.
 */
export const en: Dictionary = {
  locale: "en",
  common: commonEn,
  errors: errorsEn,
  hotkeys: hotkeysEn,
  launcher: launcherEn,
  settings: settingsEn,
  hud: hudEn,
  onboarding: onboardingEn,
};
