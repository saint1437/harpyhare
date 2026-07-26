import { useMemo } from "react";
import { usePermissions, type PermissionsApi } from "@/hooks/usePermissions";
import type { Settings } from "@/ipc/types";
import { missingApiKeys, missingKeysNotice, type ApiKeyInfo } from "@/lib/api-keys";
import type { ScreenId } from "./screens";

export interface LauncherBlocker {
  label: string;
  screen: ScreenId;
}

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

export function useLauncherReadiness(settings: Settings): LauncherReadiness {
  const missingKeys = useMemo(() => missingApiKeys(settings), [settings]);
  const permissions = usePermissions();
  const checking = !permissions.loaded;

  const blockers = useMemo(() => {
    const list: LauncherBlocker[] = [];
    if (missingKeys.length > 0) {
      list.push({ label: missingKeysNotice(missingKeys), screen: "settings" });
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
