import type { ContextLibraryApi } from "@/hooks/useContextLibrary";
import type { Settings, UpdateInfo } from "@/ipc/types";
import type { LauncherReadiness } from "./useLauncherReadiness";

export type SetSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => void;

export interface SectionProps {
  draft: Settings;
  set: SetSetting;
}

export interface LauncherPanelProps {
  settings: Settings;
  appVersion: string;
  contextLibrary: ContextLibraryApi;
  readiness: LauncherReadiness;
  launching: boolean;
  error: string | null;
  onRedeem: (code: string) => Promise<string | null>;
  onCheckUpdates: () => Promise<UpdateInfo | null>;
  onSave: (next: Settings) => void;
  onLaunch: (next: Settings) => void;
}
