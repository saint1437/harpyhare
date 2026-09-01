export const PLATFORMS = ["macos", "windows"] as const;

export type Platform = (typeof PLATFORMS)[number];

const DEFAULT_PLATFORM: Platform = "macos";
const WINDOWS_USER_AGENT_MARKER = "windows";

export const FILE_MANAGER_LABEL: Record<Platform, string> = {
  macos: "Finder",
  windows: "проводника",
};

export function detectPlatform(userAgent: string): Platform {
  return userAgent.toLowerCase().includes(WINDOWS_USER_AGENT_MARKER) ? "windows" : DEFAULT_PLATFORM;
}

export const PLATFORM: Platform = detectPlatform(navigator.userAgent);
