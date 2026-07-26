export interface HotkeyHint {
  combo: string;
  label: string;
}

export interface HotkeyGroup {
  title: string;
  hints: HotkeyHint[];
}

export const OPACITY_MODIFIER = "Cmd+Shift";

export interface HotkeyConfig {
  ptt: string;
  toggleWindow: string;
  teleprompter: string;
  screenshot: string;
  moveWindow: string;
  resizeWindow: string;
  scrollChat: string;
}

const COMBO_REPLACEMENTS: [RegExp, string][] = [
  [/(?:Command|Cmd|Super)\+?/gi, "⌘"],
  [/Shift\+?/gi, "⇧"],
  [/(?:Option|Alt)\+?/gi, "⌥"],
  [/(?:Control|Ctrl)\+?/gi, "⌃"],
];

export function formatCombo(combo: string): string {
  return COMBO_REPLACEMENTS.reduce((acc, [re, symbol]) => acc.replace(re, symbol), combo);
}

export type ComboIconName =
  | "cmd"
  | "shift"
  | "option"
  | "ctrl"
  | "enter"
  | "up"
  | "down"
  | "left"
  | "right"
  | "plus"
  | "minus";

export type ComboToken = { type: "icon"; icon: ComboIconName } | { type: "text"; text: string };

const ICON_BY_CHAR: Record<string, ComboIconName> = {
  "⌘": "cmd",
  "⇧": "shift",
  "⌥": "option",
  "⌃": "ctrl",
  "⏎": "enter",
  "↑": "up",
  "↓": "down",
  "←": "left",
  "→": "right",
  "+": "plus",
  "−": "minus",
};

export function comboTokens(combo: string): ComboToken[] {
  const tokens: ComboToken[] = [];
  for (const ch of combo) {
    const icon = ICON_BY_CHAR[ch];
    if (icon) {
      tokens.push({ type: "icon", icon });
      continue;
    }
    if (ch === " ") continue;
    const last = tokens[tokens.length - 1];
    if (last?.type === "text") last.text += ch;
    else tokens.push({ type: "text", text: ch });
  }
  return tokens;
}

export function hotkeyGroups(cfg: HotkeyConfig): HotkeyGroup[] {
  return [
    {
      title: "Запись",
      hints: [
        { combo: formatCombo(cfg.ptt), label: "записать системный звук (зажать)" },
        { combo: "Esc", label: "отменить запись" },
      ],
    },
    {
      title: "Отправка",
      hints: [
        { combo: "⏎", label: "отправить" },
        { combo: "⇧⏎", label: "перенос строки" },
        { combo: "⌘V", label: "вставить скриншот" },
        { combo: formatCombo(cfg.screenshot), label: "снимок области экрана" },
      ],
    },
    {
      title: "Окно",
      hints: [
        { combo: formatCombo(cfg.toggleWindow), label: "скрыть / показать" },
        { combo: `${formatCombo(cfg.moveWindow)} ←→↑↓`, label: "передвинуть" },
        { combo: `${formatCombo(cfg.resizeWindow)} ←→↑↓`, label: "изменить размер" },
        { combo: `${formatCombo(OPACITY_MODIFIER)} + −`, label: "прозрачность" },
      ],
    },
    {
      title: "Чат",
      hints: [
        { combo: `${formatCombo(cfg.scrollChat)} ↑↓`, label: "скролл" },
        { combo: formatCombo(cfg.teleprompter), label: "суфлёр" },
      ],
    },
  ];
}
