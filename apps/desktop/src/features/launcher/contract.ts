import type { SecretsApi } from "@/features/settings/contract";
import type { SettingsTabId } from "@/features/settings/settings-tabs";
import type { ContextLibraryApi } from "@/hooks/useContextLibrary";
import type { UpdaterApi } from "@/hooks/useUpdater";
import type { Settings } from "@/ipc/types";
import type { ScreenId } from "./screens";
import type { LauncherReadiness } from "./useLauncherReadiness";

export interface LauncherDestination {
  screen: ScreenId;
  tab?: SettingsTabId;
}

export interface LauncherPanelProps {
  settings: Settings;
  contextLibrary: ContextLibraryApi;
  readiness: LauncherReadiness;
  secrets: SecretsApi;
  updater: UpdaterApi;
  launching: boolean;
  saving: boolean;
  /** The status object's state only: the text of the failure went into a notification. */
  saveFailed: boolean;
  onSave: (next: Settings) => void;
  onLaunch: (next: Settings) => void;
  onReplayOnboarding: () => void;
}
