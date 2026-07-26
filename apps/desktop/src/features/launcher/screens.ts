import {
  Download,
  Library,
  MessageSquareText,
  ShieldCheck,
  SlidersHorizontal,
  VenetianMask,
  type LucideIcon,
} from "lucide-react";

export const LAUNCHER_SCREENS = [
  {
    id: "contexts",
    label: "Контексты",
    description: "Справочные материалы, которые можно подмешать в системный промпт чата.",
    icon: Library,
    group: "content",
  },
  {
    id: "presets",
    label: "Пресеты",
    description: "Препромпты: текст, который встаёт в начало системного промпта.",
    icon: MessageSquareText,
    group: "content",
  },
  {
    id: "identity",
    label: "Маскировка",
    description: "Имя и иконка, под которыми приложение видно в системе.",
    icon: VenetianMask,
    group: "content",
  },
  {
    id: "settings",
    label: "Настройки",
    description: "Доступ к API, распознавание речи, клавиши, поведение и вид.",
    icon: SlidersHorizontal,
    group: "system",
  },
  {
    id: "permissions",
    label: "Доступы",
    description: "Разрешения macOS, без которых часть приложения не работает.",
    icon: ShieldCheck,
    group: "system",
  },
  {
    id: "updates",
    label: "Обновления",
    description: "Версия приложения и установка новой.",
    icon: Download,
    group: "system",
  },
] as const satisfies readonly {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  group: "content" | "system";
}[];

export type ScreenId = (typeof LAUNCHER_SCREENS)[number]["id"];

export const DEFAULT_SCREEN: ScreenId = "settings";

export function screenGroup(group: "content" | "system") {
  return LAUNCHER_SCREENS.filter((s) => s.group === group);
}

export function screenMeta(id: ScreenId) {
  return LAUNCHER_SCREENS.find((s) => s.id === id) ?? LAUNCHER_SCREENS[0];
}
