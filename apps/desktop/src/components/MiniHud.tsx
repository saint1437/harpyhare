import { Maximize2 } from "lucide-react";
import { EqBars, type EqBarsProps } from "@/components/EqBars";
import { IconButton } from "@/components/IconButton";
import { useWindowDrag } from "@/hooks/useWindowDrag";
import type { RecorderState } from "@/ipc/types";
import { formatCombo } from "@/lib/hotkeys";
import { miniStatus, type MiniStatus } from "@/lib/mini-status";
import { cn } from "@/lib/utils";

const STATUS_VIEW: Record<MiniStatus, { label: string; labelClass: string; bars: EqBarsProps }> = {
  recording: {
    label: "Запись",
    labelClass: "text-foreground",
    bars: { animated: true, barClass: "bg-recording" },
  },
  transcribing: {
    label: "Расшифровка…",
    labelClass: "text-muted-foreground",
    bars: { animated: true, barClass: "bg-primary" },
  },
  streaming: {
    label: "Ответ…",
    labelClass: "text-muted-foreground",
    bars: { animated: true, barClass: "bg-primary/70" },
  },
  error: {
    label: "Ошибка",
    labelClass: "text-destructive",
    bars: { animated: false, barClass: "bg-destructive" },
  },
  unread: {
    label: "Ответ готов",
    labelClass: "text-foreground",
    bars: { animated: false, barClass: "bg-primary" },
  },
  idle: {
    label: "",
    labelClass: "text-muted-foreground",
    bars: { animated: false, barClass: "bg-muted-foreground/50" },
  },
};

export interface MiniHudProps {
  state: RecorderState;
  streaming: boolean;
  hasError: boolean;
  unreadAnswer: boolean;
  expandCombo: string;
  onExpand: () => void;
}

export function MiniHud({
  state,
  streaming,
  hasError,
  unreadAnswer,
  expandCombo,
  onExpand,
}: MiniHudProps) {
  const onDragMouseDown = useWindowDrag();
  const view = STATUS_VIEW[miniStatus(state, streaming, hasError, unreadAnswer)];
  return (
    <div className="h-screen w-screen p-1" onMouseDown={onDragMouseDown}>
      <div className="flex h-full items-center gap-2 rounded-full bg-background py-1 pr-1 pl-3 ring-1 ring-border ring-inset">
        <EqBars {...view.bars} />
        <span className={cn("min-w-0 flex-1 truncate text-caption", view.labelClass)}>
          {view.label}
        </span>
        <IconButton
          title={`Развернуть — ${formatCombo(expandCombo)}`}
          aria-label="Развернуть окно"
          onClick={onExpand}
        >
          <Maximize2 />
        </IconButton>
      </div>
    </div>
  );
}
