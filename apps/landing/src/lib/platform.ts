export const PLATFORMS = ["macos", "windows"] as const;

export type Platform = (typeof PLATFORMS)[number];

export const DEFAULT_PLATFORM: Platform = "macos";

export const PLATFORM_LABELS: Record<Platform, string> = {
  macos: "macOS",
  windows: "Windows",
};

export const PLATFORM_REQUIREMENTS: Record<Platform, string> = {
  macos: "macOS 14.2+ · Apple Silicon",
  windows: "Windows 10 (2004+) / 11 · x64",
};

const PLATFORM_LABEL_CONJUNCTION = " и ";

export const SUPPORTED_PLATFORMS_LABEL = PLATFORMS.map(
  (platform) => PLATFORM_LABELS[platform],
).join(PLATFORM_LABEL_CONJUNCTION);

const WINDOWS_USER_AGENT_MARKER = "windows";

export function detectPlatform(userAgent: string): Platform {
  return userAgent.toLowerCase().includes(WINDOWS_USER_AGENT_MARKER) ? "windows" : DEFAULT_PLATFORM;
}

export function otherPlatform(platform: Platform): Platform {
  return PLATFORMS.find((candidate) => candidate !== platform) ?? DEFAULT_PLATFORM;
}
