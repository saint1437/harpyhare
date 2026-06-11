const HINTS: [string, string][] = [
  ["V", "запись"],
  ["⌘⏎", "отправить"],
  ["⌘V", "скриншот"],
  ["⌘←→↑↓", "окно"],
];

export function HotkeyHints() {
  return (
    <footer className="flex justify-center gap-4 text-[10.5px] text-muted-foreground select-none" aria-hidden>
      {HINTS.map(([k, label]) => (
        <span key={k}>
          <b className="font-mono font-semibold text-[10px] text-foreground/80">{k}</b> {label}
        </span>
      ))}
    </footer>
  );
}
