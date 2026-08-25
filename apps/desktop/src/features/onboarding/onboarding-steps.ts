import { PLATFORM, type Platform } from "@/lib/platform";
import { requiredPermissionRows } from "../launcher/permission-rows";

/**
 * The step list is DERIVED, never typed out.
 *
 * The permission steps come from `PERMISSION_ROWS` through the same
 * `requiredPermissionRows` the launcher's readiness uses, so marking another
 * permission `need: "launch"` puts it into onboarding by itself — and Windows,
 * where system audio needs no consent at all, gets three steps instead of four
 * without a single platform branch in the flow.
 *
 * The microphone is deliberately absent: auto mode ships off, so nothing on the
 * path to a first answer needs it. Screen recording likewise — it belongs to the
 * region screenshot, which is not first value.
 */
export const ONBOARDING_STEP_IDS = ["access", "audio", "privacy", "ready"] as const;
export type OnboardingStepId = (typeof ONBOARDING_STEP_IDS)[number];

const AUDIO_STEP: OnboardingStepId = "audio";

/** Auto mode is off during onboarding, so only `need: "launch"` rows can appear. */
const AUTO_MODE_DURING_ONBOARDING = false;

export function onboardingSteps(platform: Platform = PLATFORM): OnboardingStepId[] {
  const audioIsAsked = requiredPermissionRows(AUTO_MODE_DURING_ONBOARDING).some(
    (row) => row.kind === "audio",
  );
  const askedOnThisPlatform = audioIsAsked && platform === "macos";
  return ONBOARDING_STEP_IDS.filter((id) => id !== AUDIO_STEP || askedOnThisPlatform);
}

export function stepPosition(steps: OnboardingStepId[], current: OnboardingStepId): number {
  return Math.max(0, steps.indexOf(current));
}
