import { commonRu } from "./common-ru";
import { errorsRu } from "./errors-ru";
import { hotkeysRu } from "./hotkeys-ru";
import { hudRu } from "./hud-ru";
import { launcherRu } from "./launcher-ru";
import { onboardingRu } from "./onboarding-ru";
import { settingsRu } from "./settings-ru";
import type { Dictionary } from "./types";

/** The source language: every string is written here first. */
export const ru: Dictionary = {
  locale: "ru",
  common: commonRu,
  errors: errorsRu,
  hotkeys: hotkeysRu,
  launcher: launcherRu,
  settings: settingsRu,
  hud: hudRu,
  onboarding: onboardingRu,
};
