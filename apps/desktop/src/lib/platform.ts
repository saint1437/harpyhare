export const PLATFORMS = ["macos", "windows"] as const;

export type Platform = (typeof PLATFORMS)[number];

const DEFAULT_PLATFORM: Platform = "macos";
const WINDOWS_USER_AGENT_MARKER = "windows";

export function detectPlatform(userAgent: string): Platform {
  return userAgent.toLowerCase().includes(WINDOWS_USER_AGENT_MARKER) ? "windows" : DEFAULT_PLATFORM;
}

export const PLATFORM: Platform = detectPlatform(navigator.userAgent);

/**
 * Left inset for macOS traffic lights in a merged-titlebar launcher header.
 * One constant for both headers (LaunchBar and OnboardingFlow): a tweak to the
 * window-button metrics must not misalign only one of the two flows.
 */
export const TRAFFIC_LIGHTS_INSET_CLASS = PLATFORM === "macos" ? "pl-16" : "";
