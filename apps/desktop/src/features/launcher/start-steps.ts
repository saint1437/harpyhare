import { KeyRound, type LucideIcon } from "lucide-react";
import type { PermissionKind } from "@/ipc/bindings";
import { API_ACCESS_TITLE, missingKeysNotice } from "@/lib/api-keys";
import { PLATFORM, type Platform } from "@/lib/platform";
import { PERMISSION_ROWS } from "./permission-rows";
import { screenVisible, type ScreenId } from "./screens";
import type { SettingsTabId } from "./settings-tabs";
import type { LauncherReadiness } from "./useLauncherReadiness";

export type StartStepId = "access" | PermissionKind;

/** `checking` — ответа о доступах ещё нет; показывать «нужно сделать» до него нельзя. */
export type StartStepState = "done" | "todo" | "checking";

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
const ACCESS_STEP_DONE_HINT = "Запросы уходят от вашего имени — ключи или код уже приняты.";
const ACCESS_TAB: SettingsTabId = "access";
const PERMISSIONS_SCREEN: ScreenId = "permissions";
const SETTINGS_SCREEN: ScreenId = "settings";

function accessStep(readiness: LauncherReadiness): StartStep {
  const missing = readiness.missingKeys;
  return {
    id: ACCESS_STEP_ID,
    title: API_ACCESS_TITLE,
    hint: missing.length === 0 ? ACCESS_STEP_DONE_HINT : missingKeysNotice(missing),
    icon: KeyRound,
    state: missing.length === 0 ? "done" : "todo",
    screen: SETTINGS_SCREEN,
    tab: ACCESS_TAB,
  };
}

/**
 * Обязательные доступы — из реестра `PERMISSION_ROWS`, а не по имени: пометят
 * обязательным ещё один — он сам встанет в шаги старта.
 */
function permissionSteps(readiness: LauncherReadiness, platform: Platform): StartStep[] {
  if (!screenVisible(PERMISSIONS_SCREEN, platform)) return [];
  return PERMISSION_ROWS.filter((row) => row.required).map((row) => ({
    id: row.kind,
    title: row.title,
    hint: row.purpose,
    icon: row.icon,
    state: readiness.checking
      ? "checking"
      : readiness.permissions.status[row.kind] === "granted"
        ? "done"
        : "todo",
    screen: PERMISSIONS_SCREEN,
  }));
}

export function startSteps(
  readiness: LauncherReadiness,
  platform: Platform = PLATFORM,
): StartStep[] {
  return [accessStep(readiness), ...permissionSteps(readiness, platform)];
}

export function stepsLeft(steps: StartStep[]): number {
  return steps.filter((step) => step.state === "todo").length;
}
