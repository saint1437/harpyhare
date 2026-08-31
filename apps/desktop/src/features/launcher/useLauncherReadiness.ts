import { useMemo } from "react";
import { usePermissions, type PermissionsApi } from "@/hooks/usePermissions";
import type { Settings } from "@/ipc/types";
import { accessGaps, type AccessGap } from "@/lib/api-keys";
import type { ScreenId } from "./screens";
import type { SettingsTabId } from "./settings-tabs";

export interface LauncherBlocker {
  label: string;
  screen: ScreenId;
  tab?: SettingsTabId;
}

const KEYS_TAB: SettingsTabId = "access";
/** A missing speech key is fixed either here or by switching provider — both live on this tab. */
const SPEECH_TAB: SettingsTabId = "access";

const AUDIO_BLOCKER: LauncherBlocker = {
  label: "Нет доступа к записи системного звука",
  screen: "permissions",
};

export interface LauncherReadiness {
  gaps: AccessGap[];
  permissions: PermissionsApi;
  blockers: LauncherBlocker[];
  checking: boolean;
  ready: boolean;
}

export function useLauncherReadiness(settings: Settings): LauncherReadiness {
  const gaps = useMemo(() => accessGaps(settings), [settings]);
  const permissions = usePermissions();
  const checking = !permissions.loaded;

  const blockers = useMemo(() => {
    const list: LauncherBlocker[] = gaps.map((gap) => ({
      label: gap.label,
      screen: "settings",
      tab: gap.kind === "speech" ? SPEECH_TAB : KEYS_TAB,
    }));
    if (!checking && !permissions.audioOk) list.push(AUDIO_BLOCKER);
    return list;
  }, [gaps, checking, permissions.audioOk]);

  return {
    gaps,
    permissions,
    blockers,
    checking,
    ready: gaps.length === 0 && permissions.audioOk,
  };
}
