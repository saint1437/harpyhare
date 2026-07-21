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

export function hotkeyGroups(cfg: HotkeyConfig): HotkeyGroup[] {
  return [
    {
      title: "Запись",
      hints: [
        { combo: cfg.ptt, label: "записать системный звук (зажать)" },
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
        { combo: cfg.toggleWindow, label: "скрыть / показать" },
        { combo: "⌘ ←→↑↓", label: "передвинуть" },
        { combo: "⌘⇧ ←→↑↓", label: "изменить размер" },
        { combo: "⌘⇧ + −", label: "прозрачность" },
      ],
    },
    {
      title: "Чат",
      hints: [
        { combo: "⌥ ↑↓", label: "скролл" },
        { combo: cfg.teleprompter, label: "суфлёр" },
      ],
    },
  ];
}
