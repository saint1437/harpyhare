import { useWindowDrag } from "@/hooks/useWindowDrag";

export interface HotkeyHintsProps {
  hotkey: string;
}

type Hint = [combo: string, label: string];

const RECORD_HINT_LABEL = "запись";

const STATIC_HINTS: Hint[] = [
  ["⌘⏎", "отправить"],
  ["⌘V", "скриншот"],
  ["⌘←→↑↓", "окно"],
  ["⌘⇧←→↑↓", "размер"],
  ["⌥↑↓", "скролл"],
];

export function HotkeyHints({ hotkey }: HotkeyHintsProps) {
  const hints: Hint[] = [[hotkey, RECORD_HINT_LABEL], ...STATIC_HINTS];
  const onDragMouseDown = useWindowDrag();
  return (
    <footer
      className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-[10.5px] text-muted-foreground select-none"
      aria-hidden
      onMouseDown={onDragMouseDown}
    >
      {hints.map(([combo, label]) => (
        <span key={label}>
          <b className="font-mono text-[10px] font-semibold text-foreground/80">{combo}</b> {label}
        </span>
      ))}
    </footer>
  );
}
