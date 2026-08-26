import {
  Download,
  Library,
  MessageSquareText,
  Rocket,
  ShieldCheck,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import type { ScreenKey } from "@/i18n/launcher-types";
import type { Dictionary } from "@/i18n/types";
import { PLATFORM, type Platform } from "@/lib/platform";

/**
 * The order the sidebar draws them in. The groups carry no title of their own —
 * the rail is icons only at every width, and the screen's name lives in its
 * `title` and in the `ScreenShell` heading.
 */
export const SCREEN_GROUPS = ["start", "content", "system"] as const;

export type ScreenGroup = (typeof SCREEN_GROUPS)[number];

/**
 * The registry keeps what a dictionary cannot: the icon, the group and the
 * platforms a screen exists on. The label and the description are
 * `dict.launcher.screens`, keyed by this same id — so the sidebar, `ScreenShell`
 * and the search index all name a screen with one string per locale, and a
 * screen added without a translation fails `tsc`.
 */
interface ScreenMeta {
  id: ScreenKey;
  icon: LucideIcon;
  group: ScreenGroup;
  platforms?: readonly Platform[];
}

const MACOS_ONLY: readonly Platform[] = ["macos"];

export const LAUNCHER_SCREENS = [
  { id: "start", icon: Rocket, group: "start" },
  { id: "contexts", icon: Library, group: "content" },
  { id: "presets", icon: MessageSquareText, group: "content" },
  { id: "settings", icon: SlidersHorizontal, group: "system" },
  { id: "permissions", icon: ShieldCheck, group: "system", platforms: MACOS_ONLY },
  { id: "updates", icon: Download, group: "system" },
] as const satisfies readonly ScreenMeta[];

export type ScreenId = (typeof LAUNCHER_SCREENS)[number]["id"];

export const DEFAULT_SCREEN: ScreenId = "start";

function availableOn(screen: ScreenMeta, platform: Platform): boolean {
  return screen.platforms?.includes(platform) ?? true;
}

export function screenGroup(group: ScreenGroup, platform: Platform = PLATFORM) {
  return LAUNCHER_SCREENS.filter((s) => s.group === group && availableOn(s, platform));
}

export function screenMeta(id: ScreenId) {
  return LAUNCHER_SCREENS.find((s) => s.id === id) ?? LAUNCHER_SCREENS[0];
}

/** The only way from a screen id to the two phrases that name it. */
export function screenCopy(id: ScreenId, dict: Dictionary) {
  return dict.launcher.screens[id];
}

export function screenVisible(id: ScreenId, platform: Platform = PLATFORM): boolean {
  return availableOn(screenMeta(id), platform);
}
