/**
 * The product runs on exactly two platforms, and both halves of the monorepo
 * had their own copy of that fact: the desktop app derives every
 * platform-dependent label from it, and the landing page names it on the
 * download button. `detectPlatform` was character-for-character identical in
 * the two copies.
 */
export const PLATFORMS = ["macos", "windows"] as const;

export type Platform = (typeof PLATFORMS)[number];

/** Anything we cannot recognise is treated as macOS — the primary target. */
export const DEFAULT_PLATFORM: Platform = "macos";

const WINDOWS_USER_AGENT_MARKER = "windows";

/**
 * Works on a full user-agent string and on a bare `userAgentData` platform hint
 * alike — both merely have to contain the word.
 */
export function detectPlatform(userAgent: string): Platform {
  return userAgent.toLowerCase().includes(WINDOWS_USER_AGENT_MARKER) ? "windows" : DEFAULT_PLATFORM;
}

/** The other half of the pair — there are only two, so this is total. */
export function otherPlatform(platform: Platform): Platform {
  return PLATFORMS.find((candidate) => candidate !== platform) ?? DEFAULT_PLATFORM;
}

/**
 * The oldest OS release each bundle runs on. Kept apart from the prose below so
 * that documentation and marketing copy can be CHECKED against it: the same
 * numbers are spelled out in the landing page's FAQ (both languages) and in the
 * desktop app's README, and tests on both sides assert they still agree.
 *
 * macOS 14.2 is where the Core Audio process tap arrives; Windows 10 version
 * 2004 is where `SetWindowDisplayAffinity` learns to hide a window from screen
 * capture.
 */
export const PLATFORM_MIN_VERSIONS: Record<Platform, string> = {
  macos: "14.2",
  windows: "2004",
};

/** One line per platform, for a badge or a tooltip. */
export const PLATFORM_REQUIREMENTS: Record<Platform, string> = {
  macos: "macOS 14.2+ · Apple Silicon",
  windows: "Windows 10 (2004+) / 11 · x64",
};
