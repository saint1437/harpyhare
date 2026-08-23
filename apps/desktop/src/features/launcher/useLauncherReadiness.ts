import { useMemo } from "react";
import { usePermissions, type PermissionsApi } from "@/hooks/usePermissions";
import type { Settings } from "@/ipc/types";
import { missingApiKeys, missingKeysNotice, type ApiKeyInfo } from "@/lib/api-keys";
import type { ScreenId } from "./screens";
import type { SettingsTabId } from "./settings-tabs";

export interface LauncherBlocker {
  label: string;
  screen: ScreenId;
  tab?: SettingsTabId;
}

const KEYS_TAB: SettingsTabId = "access";

const AUDIO_BLOCKER: LauncherBlocker = {
  label: "Нет доступа к записи системного звука",
  screen: "permissions",
};

export interface LauncherReadiness {
  missingKeys: ApiKeyInfo[];
  permissions: PermissionsApi;
  blockers: LauncherBlocker[];
  checking: boolean;
  ready: boolean;
}

export function canLaunch(readiness: LauncherReadiness, launching: boolean): boolean {
  return readiness.ready && !readiness.checking && !launching;
}

export function useLauncherReadiness(settings: Settings): LauncherReadiness {
  const missingKeys = useMemo(() => missingApiKeys(settings), [settings]);
  const permissions = usePermissions();
  const checking = !permissions.loaded;

  const blockers = useMemo(() => {
    const list: LauncherBlocker[] = [];
    if (missingKeys.length > 0) {
      list.push({ label: missingKeysNotice(missingKeys), screen: "settings", tab: KEYS_TAB });
    }
    if (!checking && !permissions.audioOk) list.push(AUDIO_BLOCKER);
    return list;
  }, [missingKeys, checking, permissions.audioOk]);

  return {
    missingKeys,
    permissions,
    blockers,
    checking,
    ready: missingKeys.length === 0 && permissions.audioOk,
  };
}
