import { PLATFORMS, type Platform } from "@harpyhare/platform";

export {
  DEFAULT_PLATFORM,
  detectPlatform,
  otherPlatform,
  PLATFORM_MIN_VERSIONS,
  PLATFORM_REQUIREMENTS,
  PLATFORMS,
  type Platform,
} from "@harpyhare/platform";

/** Display names, which is landing copy rather than a fact about the product. */
export const PLATFORM_LABELS: Record<Platform, string> = {
  macos: "macOS",
  windows: "Windows",
};

const PLATFORM_LABEL_CONJUNCTION = " и ";

export const SUPPORTED_PLATFORMS_LABEL = PLATFORMS.map(
  (platform) => PLATFORM_LABELS[platform],
).join(PLATFORM_LABEL_CONJUNCTION);
