import type { ReactNode } from "react";
import { useWindowDrag } from "@/hooks/useWindowDrag";
import type { RecorderState } from "@/ipc/types";
import { cn } from "@/lib/utils";
import { EqBars, type EqBarsProps } from "./EqBars";
import { ToolbarDock, type ToolbarDockItem } from "./ToolbarDock";

export interface ContextUsage {
  usedTokens: number;
  maxTokens: number;
}

export interface StatusBarProps {
  state: RecorderState;
  error: string | null;
  tabs: ReactNode;
  dockItems: ToolbarDockItem[];
  contextUsage: ContextUsage | null;
}

const CONTEXT_USAGE_WARN_PERCENT = 80;
const CONTEXT_GAUGE_MIN_FILL_PERCENT = 3;
const PERCENT_SCALE = 100;

function ContextUsageGauge({ usage }: { usage: ContextUsage }) {
  const percent = Math.min(
    PERCENT_SCALE,
    Math.round((usage.usedTokens / usage.maxTokens) * PERCENT_SCALE),
  );
  const title = `Контекст чата: ${usage.usedTokens.toLocaleString("ru-RU")} из ${usage.maxTokens.toLocaleString("ru-RU")} токенов (по последнему запросу)`;
  return (
    <div className="flex shrink-0 items-center gap-1.5 px-1" title={title}>
      <span className="h-1 w-10 overflow-hidden rounded-full bg-surface-active">
        <span
          className={cn(
            "block h-full rounded-full transition-[width] duration-300",
            percent >= CONTEXT_USAGE_WARN_PERCENT ? "bg-destructive" : "bg-muted-foreground/60",
          )}
          style={{ width: `${String(Math.max(CONTEXT_GAUGE_MIN_FILL_PERCENT, percent))}%` }}
        />
      </span>
      <span className="text-hint text-muted-foreground tabular-nums">{percent}%</span>
    </div>
  );
}

function indicatorProps(state: RecorderState, showError: boolean): EqBarsProps {
  if (state === "recording") return { animated: true, barClass: "bg-recording" };
  if (state === "transcribing") return { animated: true, barClass: "bg-primary" };
  return { animated: false, barClass: showError ? "bg-destructive" : "bg-muted-foreground/50" };
}

export function StatusBar({ state, error, tabs, dockItems, contextUsage }: StatusBarProps) {
  const showError = error !== null && state === "idle";
  const onDragMouseDown = useWindowDrag();

  return (
    <header className="flex min-h-7 items-center gap-2" onMouseDown={onDragMouseDown}>
      <EqBars {...indicatorProps(state, showError)} />
      {tabs}
      <span
        title={showError ? error : undefined}
        className="min-w-0 flex-1 truncate text-caption text-destructive"
      >
        {showError ? error : ""}
      </span>
      <div className="flex shrink-0 items-center gap-1.5">
        {contextUsage && <ContextUsageGauge usage={contextUsage} />}
        <ToolbarDock items={dockItems} />
      </div>
    </header>
  );
}
