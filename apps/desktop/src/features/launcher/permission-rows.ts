import { AudioLines, Mic, Monitor, type LucideIcon } from "lucide-react";
import type { PermissionKind } from "@/ipc/bindings";

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
