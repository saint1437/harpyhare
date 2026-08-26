import { AudioLines, Mic, Monitor, type LucideIcon } from "lucide-react";
import type { StateTone } from "@/components/StateBadge";
import type { PermissionKind, PermissionState } from "@/ipc/bindings";

/**
 * Для чего доступ нужен, а не просто «обязателен ли»: микрофон не нужен никому,
 * кроме автослушания, но ЕМУ он нужен жёстко — `auto::start` без него не поднимется.
 */
export type PermissionNeed = "launch" | "auto-mode" | "optional";

export interface PermissionRow {
  kind: PermissionKind;
  title: string;
  purpose: string;
  icon: LucideIcon;
  need: PermissionNeed;
}

const NEED_LABEL: Record<PermissionNeed, string> = {
  launch: "обязателен",
  "auto-mode": "нужен автослушанию",
  optional: "необязателен",
};

export function permissionNeedLabel(need: PermissionNeed): string {
  return NEED_LABEL[need];
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

export const PERMISSION_ROWS: PermissionRow[] = [
  {
    kind: "audio",
    title: "Запись системного звука",
    purpose: "Приложение слышит собеседника и расшифровывает речь. Без него запускать нечего.",
    icon: AudioLines,
    need: "launch",
  },
  {
    kind: "microphone",
    title: "Микрофон",
    purpose: "Нужен автослушанию, чтобы отделить вашу речь от речи собеседника.",
    icon: Mic,
    need: "auto-mode",
  },
  {
    kind: "screen",
    title: "Запись экрана",
    purpose: "Нужна снимку области экрана. Без неё работает всё остальное.",
    icon: Monitor,
    need: "optional",
  },
];

/** Доступы, без которых нельзя запускаться при ТЕКУЩИХ настройках. */
export function requiredPermissionRows(autoModeEnabled: boolean): PermissionRow[] {
  return PERMISSION_ROWS.filter(
    (row) => row.need === "launch" || (row.need === "auto-mode" && autoModeEnabled),
  );
}
