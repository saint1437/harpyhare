import { Keyboard } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface HotkeysPopoverProps {
  hotkey: string;
  toggleHotkey: string;
  teleprompterHotkey: string;
}

type Hint = [combo: string, label: string];

function hintsFor({ hotkey, toggleHotkey, teleprompterHotkey }: HotkeysPopoverProps): Hint[] {
  return [
    [hotkey, "записать системный звук (зажать)"],
    ["Esc", "отменить запись"],
    ["⏎", "отправить"],
    ["⇧⏎", "перенос строки"],
    ["⌘V", "вставить скриншот"],
    [toggleHotkey, "скрыть/показать окно"],
    [teleprompterHotkey, "суфлёр"],
    ["⌘←→↑↓", "передвинуть окно"],
    ["⌘⇧←→↑↓", "изменить размер окна"],
    ["⌥↑↓", "скролл чата"],
    ["⌘⇧ + / −", "прозрачность окна"],
  ];
}

function HintRow({ combo, label }: { combo: string; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <kbd className="shrink-0 rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10.5px] text-foreground/80">
        {combo}
      </kbd>
    </div>
  );
}

export function HotkeysPopover(props: HotkeysPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Горячие клавиши"
          aria-label="Горячие клавиши"
          className="grid size-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          <Keyboard className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="max-h-[70vh] w-72 overflow-y-auto p-3">
        <div className="flex flex-col gap-1.5">
          {hintsFor(props).map(([combo, label]) => (
            <HintRow key={label} combo={combo} label={label} />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
