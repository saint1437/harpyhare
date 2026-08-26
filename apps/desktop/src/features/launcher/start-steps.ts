import { KeyRound, type LucideIcon } from "lucide-react";
import { permissionRowCopy, requiredPermissionRows } from "@/features/settings/permission-rows";
import type { SettingsTabId } from "@/features/settings/settings-tabs";
import type { StartStepStateKey } from "@/i18n/launcher-types";
import type { Dictionary } from "@/i18n/types";
import type { PermissionKind } from "@/ipc/types";
import { missingKeysNotice } from "@/lib/api-keys";
import { PLATFORM, type Platform } from "@/lib/platform";
import { screenVisible, type ScreenId } from "./screens";
import type { LauncherReadiness } from "./useLauncherReadiness";

export type StartStepId = "access" | PermissionKind;

/** `checking` — ответа о доступах ещё нет; показывать «нужно сделать» до него нельзя. */
export type StartStepState = StartStepStateKey;

export interface StartStep {
  id: StartStepId;
  title: string;
  hint: string;
  icon: LucideIcon;
  state: StartStepState;
  screen: ScreenId;
  tab?: SettingsTabId;
}

const ACCESS_STEP_ID: StartStepId = "access";
const ACCESS_TAB: SettingsTabId = "access";
const PERMISSIONS_SCREEN: ScreenId = "permissions";
const SETTINGS_SCREEN: ScreenId = "settings";

/**
 * The step's title is the very card `ApiKeysSection` puts on the settings screen
 * and its unfinished text is the wording the header blocker already uses — both
 * out of the dictionary, so «Старт» cannot start saying something else.
 */
function accessStep(readiness: LauncherReadiness, dict: Dictionary): StartStep {
  const missing = readiness.missingKeys;
  return {
    id: ACCESS_STEP_ID,
    title: dict.common.apiKeys.accessTitle,
    hint: missing.length === 0 ? dict.launcher.start.accessDone : missingKeysNotice(missing, dict),
    icon: KeyRound,
    state: missing.length === 0 ? "done" : "todo",
    screen: SETTINGS_SCREEN,
    tab: ACCESS_TAB,
  };
}

/**
 * Обязательные доступы — из реестра `PERMISSION_ROWS`, а не по имени: пометят
 * нужным ещё один — он сам встанет в шаги старта. Набор зависит от настроек:
 * микрофон нужен только автослушанию, поэтому и спрашивается только при нём.
 */
function permissionSteps(
  readiness: LauncherReadiness,
  dict: Dictionary,
  platform: Platform,
): StartStep[] {
  if (!screenVisible(PERMISSIONS_SCREEN, platform)) return [];
  return requiredPermissionRows(readiness.autoModeEnabled).map((row) => {
    const copy = permissionRowCopy(row.kind, dict);
    return {
      id: row.kind,
      title: copy.title,
      hint: copy.purpose,
      icon: row.icon,
      state: readiness.checking
        ? "checking"
        : readiness.permissions.status[row.kind] === "granted"
          ? "done"
          : "todo",
      screen: PERMISSIONS_SCREEN,
    };
  });
}

export function startSteps(
  readiness: LauncherReadiness,
  dict: Dictionary,
  platform: Platform = PLATFORM,
): StartStep[] {
  return [accessStep(readiness, dict), ...permissionSteps(readiness, dict, platform)];
}

export function stepsLeft(steps: StartStep[]): number {
  return steps.filter((step) => step.state === "todo").length;
}
