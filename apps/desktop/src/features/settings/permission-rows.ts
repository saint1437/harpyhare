import { AudioLines, Mic, Monitor, type LucideIcon } from "lucide-react";
import type { StateTone } from "@/components/StateBadge";
import type { PermissionNeedKey } from "@/i18n/settings-types";
import type { Dictionary } from "@/i18n/types";
import type { PermissionKind, PermissionState } from "@/ipc/types";

/**
 * Для чего доступ нужен, а не просто «обязателен ли»: микрофон не нужен никому,
 * кроме автослушания, но ЕМУ он нужен жёстко — `auto::start` без него не поднимется.
 */
export type PermissionNeed = PermissionNeedKey;

/**
 * The title and the purpose live in `dict.settings.permissions.rows`, keyed by
 * `kind` — the registry keeps what a dictionary cannot hold: the icon and how
 * badly the permission is needed.
 */
export interface PermissionRow {
  kind: PermissionKind;
  icon: LucideIcon;
  need: PermissionNeed;
}

export function permissionNeedLabel(need: PermissionNeed, dict: Dictionary): string {
  return dict.settings.permissions.needs[need];
}

/**
 * The state-to-colour vocabulary, single-sourced: PermissionsScreen and
 * onboarding's AudioStep each held a byte-identical copy, and the two could
 * only ever drift silently. The wording stays local to each screen (persistent
 * state vs the immediate result of a request); the colour must not.
 */
export const PERMISSION_STATE_TONE: Record<PermissionState, StateTone> = {
  granted: "success",
  denied: "danger",
  unknown: "warning",
};

export const PERMISSION_ROWS = [
  { kind: "audio", icon: AudioLines, need: "launch" },
  { kind: "microphone", icon: Mic, need: "auto-mode" },
  { kind: "screen", icon: Monitor, need: "optional" },
] as const satisfies readonly PermissionRow[];

export function permissionRowCopy(kind: PermissionKind, dict: Dictionary) {
  return dict.settings.permissions.rows[kind];
}

/** Доступы, без которых нельзя запускаться при ТЕКУЩИХ настройках. */
export function requiredPermissionRows(autoModeEnabled: boolean): PermissionRow[] {
  return PERMISSION_ROWS.filter(
    (row) => row.need === "launch" || (row.need === "auto-mode" && autoModeEnabled),
  );
}
