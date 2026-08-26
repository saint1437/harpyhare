import { detectPlatform, type Platform } from "@harpyhare/platform";

export { PLATFORMS, type Platform } from "@harpyhare/platform";

/**
 * The single source of the platform on the frontend. We never ask Rust for it:
 * a value that depended on `#[cfg]` would make `bindings.ts` differ between the
 * macOS and Windows build hosts (see the contract section of CLAUDE.md).
 */
export const PLATFORM: Platform = detectPlatform(navigator.userAgent);

/**
 * Left inset for macOS traffic lights in a merged-titlebar launcher header.
 * One constant for both headers (LaunchBar and OnboardingFlow): a tweak to the
 * window-button metrics must not misalign only one of the two flows.
 */
export const TRAFFIC_LIGHTS_INSET_CLASS = PLATFORM === "macos" ? "pl-16" : "";
