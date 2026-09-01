import { MessagesSquare, NotebookText, type LucideIcon } from "lucide-react";
import { IconButton } from "@/components/IconButton";
import { ShortcutTooltip } from "@/components/ShortcutTooltip";
import { DOCK_BUTTON_CLASS } from "@/components/ToolbarDock";
import { APP_MODES, type AppModeId } from "@/lib/modes";
import { cn } from "@/lib/utils";

const MODE_ICONS: Record<AppModeId, LucideIcon> = {
  chat: MessagesSquare,
  notes: NotebookText,
};

const ACTIVE_MODE_CLASS = "bg-surface-active text-foreground hover:text-foreground";
const MODE_TOOLTIP_SIDE = "bottom";
const MODE_LABEL_PREFIX = "Режим: ";

export interface ModeSwitchProps {
  mode: AppModeId;
  combo: string;
  onSelect: (mode: AppModeId) => void;
}

export function ModeSwitch({ mode, combo, onSelect }: ModeSwitchProps) {
  return (
    <span className="flex shrink-0 items-center gap-0.5">
      {APP_MODES.map((entry) => {
        const Icon = MODE_ICONS[entry.id];
        const active = entry.id === mode;
        return (
          <ShortcutTooltip
            key={entry.id}
            label={entry.hint}
            shortcut={combo}
            side={MODE_TOOLTIP_SIDE}
          >
            <IconButton
              title=""
              aria-label={`${MODE_LABEL_PREFIX}${entry.label}`}
              aria-pressed={active}
              className={cn(DOCK_BUTTON_CLASS, active && ACTIVE_MODE_CLASS)}
              onClick={() => {
                onSelect(entry.id);
              }}
            >
              <Icon />
            </IconButton>
          </ShortcutTooltip>
        );
      })}
    </span>
  );
}
