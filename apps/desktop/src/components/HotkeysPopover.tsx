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
import { IconButton } from "@/components/IconButton";
import { SectionLabel } from "@/components/SectionLabel";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { HotkeyBinding } from "@/ipc/types";
import { comboTokens, hotkeyGroups, type ComboIconName, type ComboToken } from "@/lib/hotkeys";
import { cn } from "@/lib/utils";

export interface HotkeysPopoverProps {
  hotkeys: HotkeyBinding[];
  triggerClass?: string;
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
    return <span className="font-mono text-caption text-foreground/90">{token.text}</span>;
  }
  const Icon = COMBO_ICONS[token.icon];
  return <Icon className="size-3 text-foreground/90" />;
}

function ComboChip({ combo }: { combo: string }) {
  return (
    <kbd className="inline-flex h-5 w-full items-center justify-center gap-0.5 rounded-sm bg-surface px-1.5 ring-1 ring-border ring-inset">
      {comboTokens(combo).map((token, i) => (
        <ComboTokenView key={i} token={token} />
      ))}
    </kbd>
  );
}

export function HotkeysPopover({ hotkeys, triggerClass }: HotkeysPopoverProps) {
  const groups = hotkeyGroups(hotkeys);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <IconButton title="" aria-label="Горячие клавиши" className={triggerClass}>
          <Keyboard />
        </IconButton>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="max-h-[70vh] w-80 overflow-y-auto p-3">
        <div className="grid grid-cols-[max-content_1fr] items-center gap-x-2.5 gap-y-1">
          {groups.map((group, index) => (
            <Fragment key={group.title}>
              <SectionLabel className={cn("col-span-2", index > 0 && "mt-2.5")}>
                {group.title}
              </SectionLabel>
              {group.hints.map((hint) => (
                <Fragment key={hint.label}>
                  <ComboChip combo={hint.combo} />
                  <span className="min-w-0 truncate text-caption text-muted-foreground">
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
