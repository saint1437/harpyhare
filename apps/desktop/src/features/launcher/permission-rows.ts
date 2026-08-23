import { AudioLines, Mic, Monitor, type LucideIcon } from "lucide-react";
import type { PermissionKind } from "@/ipc/bindings";

export interface PermissionRow {
  kind: PermissionKind;
  title: string;
  purpose: string;
  icon: LucideIcon;
  required: boolean;
}

export const PERMISSION_ROWS: PermissionRow[] = [
  {
    kind: "audio",
    title: "Запись системного звука",
    purpose: "Приложение слышит собеседника и расшифровывает речь. Без него запускать нечего.",
    icon: AudioLines,
    required: true,
  },
  {
    kind: "microphone",
    title: "Микрофон",
    purpose: "Нужен автослушанию, чтобы отделить вашу речь от речи собеседника.",
    icon: Mic,
    required: false,
  },
  {
    kind: "screen",
    title: "Запись экрана",
    purpose: "Нужна снимку области экрана. Без неё работает всё остальное.",
    icon: Monitor,
    required: false,
  },
];
