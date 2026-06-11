export interface HotkeyHintsProps {
  hotkey: string;
}

export function HotkeyHints({ hotkey }: HotkeyHintsProps) {
  const hints: [string, string][] = [
    [hotkey, "запись"],
    ["⌘⏎", "отправить"],
    ["⌘V", "скриншот"],
    ["⌘←→↑↓", "окно"],
  ];
  return (
    <footer className="flex justify-center gap-4 text-[10.5px] text-muted-foreground select-none" aria-hidden>
      {hints.map(([k, label]) => (
        <span key={label}>
          <b className="font-mono font-semibold text-[10px] text-foreground/80">{k}</b> {label}
        </span>
      ))}
    </footer>
  );
}
