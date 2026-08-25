import { useMemo } from "react";
import { usePermissions, type PermissionsApi } from "@/hooks/usePermissions";
import type { Settings } from "@/ipc/types";
import { missingApiKeys, missingKeysNotice, type ApiKeyInfo } from "@/lib/api-keys";
import { screenVisible, type ScreenId } from "./screens";
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

// Автослушание строит захват микрофона при старте и падает без него, а HUD
// поднимает режим сам, если стоит «включать при запуске»: без этого блокера
// лаунчер отпускал в HUD с зелёной галочкой, а там ждала ошибка доступа.
const MICROPHONE_BLOCKER: LauncherBlocker = {
  label: "Нет доступа к микрофону — его требует автослушание",
  screen: "permissions",
};

export interface LauncherReadiness {
  missingKeys: ApiKeyInfo[];
  permissions: PermissionsApi;
  autoModeEnabled: boolean;
  blockers: LauncherBlocker[];
  checking: boolean;
  ready: boolean;
}

export function canLaunch(readiness: LauncherReadiness, launching: boolean): boolean {
  return readiness.ready && !readiness.checking && !launching;
}

const PERMISSIONS_SCREEN: ScreenId = "permissions";

export function useLauncherReadiness(settings: Settings): LauncherReadiness {
  const missingKeys = useMemo(() => missingApiKeys(settings), [settings]);
  const permissions = usePermissions();
  const checking = !permissions.loaded;
  const autoModeEnabled = settings.auto_mode_enabled;
  // Блокер имеет право существовать только там, где до него можно дойти.
  // На платформе без экрана «Доступы» он запирал запуск без единого маршрута.
  const canReachPermissions = screenVisible(PERMISSIONS_SCREEN);
  const microphoneNeeded = autoModeEnabled && !permissions.microphoneOk && canReachPermissions;

  const blockers = useMemo(() => {
    const list: LauncherBlocker[] = [];
    if (missingKeys.length > 0) {
      list.push({ label: missingKeysNotice(missingKeys), screen: "settings", tab: KEYS_TAB });
    }
    if (checking) return list;
    if (!permissions.audioOk) list.push(AUDIO_BLOCKER);
    if (microphoneNeeded) list.push(MICROPHONE_BLOCKER);
    return list;
  }, [missingKeys, checking, permissions.audioOk, microphoneNeeded]);

  return {
    missingKeys,
    permissions,
    autoModeEnabled,
    blockers,
    checking,
    ready: missingKeys.length === 0 && permissions.audioOk && !microphoneNeeded,
  };
}
