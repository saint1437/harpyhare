import { useMemo } from "react";
import type { Readiness, ReadinessBlocker } from "@/features/settings/readiness";
import type { SettingsTabId } from "@/features/settings/settings-tabs";
import { useDict } from "@/hooks/useDict";
import { usePermissions } from "@/hooks/usePermissions";
import type { SecretsStatus, Settings } from "@/ipc/types";
import { missingApiKeys, missingKeysNotice } from "@/lib/api-keys";
import { screenVisible, type ScreenId } from "./screens";

/** A blocker the launcher can also ROUTE to — the shared shape plus a destination. */
export interface LauncherBlocker extends ReadinessBlocker {
  screen: ScreenId;
  tab?: SettingsTabId;
}

const KEYS_TAB: SettingsTabId = "access";

export interface LauncherReadiness extends Readiness {
  blockers: LauncherBlocker[];
}

const PERMISSIONS_SCREEN: ScreenId = "permissions";

export function useLauncherReadiness(
  settings: Settings,
  secrets: SecretsStatus,
): LauncherReadiness {
  const dict = useDict();
  // Признаки, а не сами ключи: значения остались в Rust, и лаунчер спрашивает
  // ровно то, что ему нужно знать, — есть ли чем ходить в API.
  const missingKeys = useMemo(() => missingApiKeys(secrets), [secrets]);
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
      list.push({
        label: missingKeysNotice(missingKeys, dict),
        screen: "settings",
        tab: KEYS_TAB,
      });
    }
    if (checking) return list;
    // Автослушание строит захват микрофона при старте и падает без него, а HUD
    // поднимает режим сам, если стоит «включать при запуске»: без этого блокера
    // лаунчер отпускал в HUD с зелёной галочкой, а там ждала ошибка доступа.
    if (!permissions.audioOk) {
      list.push({ label: dict.launcher.blockers.audio, screen: PERMISSIONS_SCREEN });
    }
    if (microphoneNeeded) {
      list.push({ label: dict.launcher.blockers.microphone, screen: PERMISSIONS_SCREEN });
    }
    return list;
  }, [missingKeys, checking, permissions.audioOk, microphoneNeeded, dict]);

  return {
    missingKeys,
    permissions,
    autoModeEnabled,
    blockers,
    checking,
    ready: missingKeys.length === 0 && permissions.audioOk && !microphoneNeeded,
  };
}
