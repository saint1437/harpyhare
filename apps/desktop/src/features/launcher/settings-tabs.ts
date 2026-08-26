import {
  AppWindow,
  Keyboard,
  KeyRound,
  Mic,
  Palette,
  Workflow,
  Zap,
  type LucideIcon,
} from "lucide-react";

interface SettingsTabMeta {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

export const SETTINGS_TABS = [
  {
    id: "access",
    label: "Ключи",
    description: "Ключи Anthropic и Groq либо код доступа вместо них.",
    icon: KeyRound,
  },
  {
    id: "speech",
    label: "Речь",
    description: "Устройства захвата, язык расшифровки, фоновый буфер и автослушание.",
    icon: Mic,
  },
  {
    id: "hotkeys",
    label: "Клавиши",
    description:
      "Сочетания записи, отправки, снимка и суфлёра. Работают, пока запущено основное окно.",
    icon: Keyboard,
  },
  {
    id: "quick-actions",
    label: "Действия",
    description: "Кнопки над полем ввода и цифровые сочетания к ним.",
    icon: Zap,
  },
  {
    id: "window",
    label: "Окно",
    description: "Модификаторы со стрелками: сдвиг, размер и скролл чата.",
    icon: AppWindow,
  },
  {
    id: "behavior",
    label: "Поведение",
    description: "Демонстрация экрана, автоотправка, превью HTML, суфлёр и буфер обмена.",
    icon: Workflow,
  },
  {
    id: "appearance",
    label: "Вид",
    description: "Тема, прозрачность окна и размер шрифта чата.",
    icon: Palette,
  },
] as const satisfies readonly SettingsTabMeta[];

export type SettingsTabId = (typeof SETTINGS_TABS)[number]["id"];

export const DEFAULT_SETTINGS_TAB: SettingsTabId = "access";

export function settingsTabMeta(id: SettingsTabId) {
  return SETTINGS_TABS.find((tab) => tab.id === id) ?? SETTINGS_TABS[0];
}
