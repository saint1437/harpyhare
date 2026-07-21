import { Keyboard } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { hotkeyGroups, type HotkeyGroup, type HotkeyHint } from "@/lib/hotkeys";

export interface HotkeysPopoverProps {
  hotkey: string;
  toggleHotkey: string;
  teleprompterHotkey: string;
}

function HintRow({ combo, label }: HotkeyHint) {
  return (
    <div className="flex items-center gap-2.5">
      <kbd className="inline-flex min-w-[76px] shrink-0 items-center justify-center rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-foreground/85">
        {combo}
      </kbd>
      <span className="min-w-0 truncate text-[11px] text-muted-foreground">{label}</span>
    </div>
  );
}

function HintGroup({ title, hints }: HotkeyGroup) {
  return (
    <section className="flex flex-col gap-1">
      <h4 className="font-mono text-[9.5px] tracking-wider text-primary/70 uppercase">{title}</h4>
      {hints.map((hint) => (
        <HintRow key={hint.label} {...hint} />
      ))}
    </section>
  );
}

export function HotkeysPopover(props: HotkeysPopoverProps) {
  const groups = hotkeyGroups({
    ptt: props.hotkey,
    toggleWindow: props.toggleHotkey,
    teleprompter: props.teleprompterHotkey,
  });
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
        <div className="flex flex-col gap-2.5">
          {groups.map((group) => (
            <HintGroup key={group.title} {...group} />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
