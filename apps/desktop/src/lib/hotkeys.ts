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
