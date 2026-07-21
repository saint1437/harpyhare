import {
  ArrowBigUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronUp,
  Command,
  CornerDownLeft,
  Keyboard,
  Minus,
  Option,
  Plus,
  type LucideIcon,
} from "lucide-react";
import { Fragment } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { comboTokens, hotkeyGroups, type ComboIconName, type ComboToken } from "@/lib/hotkeys";
import { cn } from "@/lib/utils";

export interface HotkeysPopoverProps {
  hotkey: string;
  toggleHotkey: string;
  teleprompterHotkey: string;
}

const COMBO_ICONS: Record<ComboIconName, LucideIcon> = {
  cmd: Command,
  shift: ArrowBigUp,
  option: Option,
  ctrl: ChevronUp,
  enter: CornerDownLeft,
  up: ArrowUp,
  down: ArrowDown,
  left: ArrowLeft,
  right: ArrowRight,
  plus: Plus,
  minus: Minus,
};

function ComboTokenView({ token }: { token: ComboToken }) {
  if (token.type === "text") {
    return <span className="font-mono text-[12.5px] text-foreground/90">{token.text}</span>;
  }
  const Icon = COMBO_ICONS[token.icon];
  return <Icon className="size-4 text-foreground/90" />;
}

function ComboChip({ combo }: { combo: string }) {
  return (
    <kbd className="inline-flex w-full items-center justify-center gap-0.5 rounded-md border border-white/10 bg-white/5 px-2 py-1">
      {comboTokens(combo).map((token, i) => (
        <ComboTokenView key={i} token={token} />
      ))}
    </kbd>
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
                  <ComboChip combo={hint.combo} />
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
