import type { PermissionState } from "@/ipc/types";

/**
 * The first-run flow's copy.
 *
 * The step union lives HERE and not in `features/onboarding/onboarding-steps.ts`
 * so that the dictionary can be exhaustive over it without `i18n` importing a
 * feature — that import would close the cycle `i18n/types → onboarding-types →
 * features/onboarding → features/settings → i18n/types` which `import-x/no-cycle`
 * exists to catch. The registry `satisfies` this union instead, so the two
 * cannot drift.
 */
export type OnboardingStepKey = "access" | "audio" | "privacy" | "ready";

/** The two switches the privacy step offers inline, keyed by what they guard. */
export type PrivacyToggleKey = "buffer" | "clipboard";

export interface OnboardingToggleCopy {
  label: string;
  hint: string;
}

export interface OnboardingCopy {
  /** What each step is called, keyed by the id the flow switches on. */
  steps: Record<OnboardingStepKey, string>;
  shell: {
    /** `{step}` and `{total}` — the caption above the progress bar. */
    position: string;
    /** What the announcer says on every step change: `{step}`, `{total}`. */
    announcement: string;
  };
  access: {
    heading: string;
    intro: string;
    offline: string;
    /** Shown instead of the form when the keys or a code are already stored. */
    configured: string;
    codeLabel: string;
    codeHint: string;
    ownKeys: string;
  };
  audio: {
    heading: string;
    why: string;
    deniedNote: string;
    skip: string;
    grant: string;
    openSystemSettings: string;
    /** The TCC prompt is up and the user has not answered it yet. */
    asking: string;
    states: Record<PermissionState, string>;
  };
  privacy: {
    heading: string;
    /** What leaves the machine, and when — one line per claim. */
    disclosures: readonly string[];
    closing: string;
    togglesTitle: string;
    toggles: Record<PrivacyToggleKey, OnboardingToggleCopy>;
  };
  ready: {
    headingReady: string;
    headingAlmost: string;
    /** Printed in place of the combination when the record key is unbound. */
    unassigned: string;
    afterwards: string;
    launch: string;
    launching: string;
    grantAudio: string;
    openLauncher: string;
    continueWithout: string;
    audioOk: string;
    audioMissing: string;
  };
}
