export interface HotkeyHintsProps {
  hotkey: string;
}

type Hint = [combo: string, label: string];

const RECORD_HINT_LABEL = "запись";

const STATIC_HINTS: Hint[] = [
  ["⌘⏎", "отправить"],
  ["⌘V", "скриншот"],
  ["⌘←→↑↓", "окно"],
];

export function HotkeyHints({ hotkey }: HotkeyHintsProps) {
  const hints: Hint[] = [[hotkey, RECORD_HINT_LABEL], ...STATIC_HINTS];
  return (
    <footer
      className="flex justify-center gap-4 text-[10.5px] text-muted-foreground select-none"
      aria-hidden
    >
      {hints.map(([combo, label]) => (
        <span key={label}>
          <b className="font-mono text-[10px] font-semibold text-foreground/80">{combo}</b> {label}
        </span>
      ))}
    </footer>
  );
}
