export interface HotkeyHint {
  combo: string;
  label: string;
}

export interface HotkeyGroup {
  title: string;
  hints: HotkeyHint[];
}

export interface HotkeyConfig {
  ptt: string;
  toggleWindow: string;
  teleprompter: string;
  bufferGrab: string | null;
}

const COMBO_REPLACEMENTS: [RegExp, string][] = [
  [/Cmd\+|Command\+|Super\+/gi, "⌘"],
  [/Shift\+/gi, "⇧"],
  [/Alt\+|Option\+/gi, "⌥"],
  [/Ctrl\+|Control\+/gi, "⌃"],
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
        ...(cfg.bufferGrab !== null
          ? [{ combo: formatCombo(cfg.bufferGrab), label: "расшифровать фоновый буфер" }]
          : []),
        { combo: "Esc", label: "отменить запись" },
      ],
    },
    {
      title: "Отправка",
      hints: [
        { combo: "⏎", label: "отправить" },
        { combo: "⇧⏎", label: "перенос строки" },
        { combo: "⌘V", label: "вставить скриншот" },
      ],
    },
    {
      title: "Окно",
      hints: [
        { combo: formatCombo(cfg.toggleWindow), label: "скрыть / показать" },
        { combo: "⌘ ←→↑↓", label: "передвинуть" },
        { combo: "⌘⇧ ←→↑↓", label: "изменить размер" },
        { combo: "⌘⇧ + −", label: "прозрачность" },
      ],
    },
    {
      title: "Чат",
      hints: [
        { combo: "⌥ ↑↓", label: "скролл" },
        { combo: formatCombo(cfg.teleprompter), label: "суфлёр" },
      ],
    },
  ];
}
