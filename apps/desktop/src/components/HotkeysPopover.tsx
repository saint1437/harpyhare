import { Keyboard } from "lucide-react";
import { Fragment } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { hotkeyGroups } from "@/lib/hotkeys";
import { cn } from "@/lib/utils";

export interface HotkeysPopoverProps {
  hotkey: string;
  toggleHotkey: string;
  teleprompterHotkey: string;
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
          <Keyboard className="size-4.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="max-h-[70vh] w-80 overflow-y-auto p-3">
        <div className="grid grid-cols-[max-content_1fr] items-center gap-x-2.5 gap-y-1">
          {groups.map((group, index) => (
            <Fragment key={group.title}>
              <h4
                className={cn(
                  "col-span-2 text-[10.5px] font-medium text-foreground/55",
                  index > 0 && "mt-2",
                )}
              >
                {group.title}
              </h4>
              {group.hints.map((hint) => (
                <Fragment key={hint.label}>
                  <kbd className="inline-flex w-full items-center justify-center rounded-md border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[16px] leading-6 whitespace-nowrap text-foreground/90">
                    {hint.combo}
                  </kbd>
                  <span className="min-w-0 truncate text-[11.5px] text-muted-foreground">
                    {hint.label}
                  </span>
                </Fragment>
              ))}
            </Fragment>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
