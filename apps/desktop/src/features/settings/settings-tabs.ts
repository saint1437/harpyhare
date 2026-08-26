import {
  AppWindow,
  Keyboard,
  KeyRound,
  Mic,
  Palette,
  Workflow,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { SettingsTabKey } from "@/i18n/settings-types";

/**
 * The order follows how often the tasks come up, not the alphabet — see
 * CLAUDE.md. What is NOT here any more is the label and the description: they
 * are `dict.settings.tabs`, keyed by this same id, so the two locales cannot
 * disagree and a new tab without a translation fails `tsc`.
 */
interface SettingsTabMeta {
  id: SettingsTabKey;
  icon: LucideIcon;
}

export const SETTINGS_TABS = [
  { id: "access", icon: KeyRound },
  { id: "speech", icon: Mic },
  { id: "hotkeys", icon: Keyboard },
  { id: "quick-actions", icon: Zap },
  { id: "window", icon: AppWindow },
  { id: "behavior", icon: Workflow },
  { id: "appearance", icon: Palette },
] as const satisfies readonly SettingsTabMeta[];

export type SettingsTabId = (typeof SETTINGS_TABS)[number]["id"];

export const DEFAULT_SETTINGS_TAB: SettingsTabId = "access";
