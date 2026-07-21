import { ArrowDownCircle, Minus, Settings as SettingsIcon, X } from "lucide-react";
import type { ReactNode } from "react";
import { IconButton } from "@/components/IconButton";
import { Button } from "@/components/ui/button";
import { useWindowDrag } from "@/hooks/useWindowDrag";
import type { RecorderState } from "@/ipc/types";
import { cn } from "@/lib/utils";
import { EqBars, type EqBarsProps } from "./EqBars";

export interface ContextUsage {
  usedTokens: number;
  maxTokens: number;
}

export interface StatusBarProps {
  state: RecorderState;
  error: string | null;
  toggleHotkey: string;
  tabs: ReactNode;
  actions: ReactNode;
  contextUsage: ContextUsage | null;
  update: { version: string; busy: boolean; onOpen: () => void } | null;
  onOpenSettings: () => void;
  onClose: () => void;
  onHide: () => void;
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
            "block h-full rounded-full",
            percent >= CONTEXT_USAGE_WARN_PERCENT ? "bg-destructive" : "bg-muted-foreground/60",
          )}
          style={{ width: `${String(Math.max(CONTEXT_GAUGE_MIN_FILL_PERCENT, percent))}%` }}
        />
      </span>
      <span className="text-hint text-muted-foreground">{percent}%</span>
    </div>
  );
}

function indicatorProps(state: RecorderState, showError: boolean): EqBarsProps {
  if (state === "recording") return { animated: true, barClass: "bg-recording" };
  if (state === "transcribing") return { animated: true, barClass: "bg-primary" };
  return { animated: false, barClass: showError ? "bg-destructive" : "bg-muted-foreground/50" };
}

export function StatusBar({
  state,
  error,
  toggleHotkey,
  tabs,
  actions,
  contextUsage,
  update,
  onOpenSettings,
  onClose,
  onHide,
}: StatusBarProps) {
  const showError = error !== null && state === "idle";
  const onDragMouseDown = useWindowDrag();

  return (
    <header className="flex min-h-7 items-center gap-2" onMouseDown={onDragMouseDown}>
      <WindowButtons toggleHotkey={toggleHotkey} onClose={onClose} onHide={onHide} />
      <EqBars {...indicatorProps(state, showError)} />
      {tabs}
      <span
        title={showError ? error : undefined}
        className="min-w-0 flex-1 truncate text-caption text-destructive"
      >
        {showError ? error : ""}
      </span>
      <div className="flex shrink-0 items-center gap-0.5">
        {contextUsage && <ContextUsageGauge usage={contextUsage} />}
        {actions}
        {update && <UpdateBadge update={update} />}
        <IconButton title="Настройки" onClick={onOpenSettings} className="hover:rotate-45">
          <SettingsIcon />
        </IconButton>
      </div>
    </header>
  );
}

function WindowButtons({
  toggleHotkey,
  onClose,
  onHide,
}: {
  toggleHotkey: string;
  onClose: () => void;
  onHide: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5 pr-1">
      <IconButton
        title="Закрыть приложение"
        onClick={onClose}
        className="hover:bg-destructive/15 hover:text-destructive"
      >
        <X />
      </IconButton>
      <IconButton
        title={`Скрыть окно — вернуть: ${toggleHotkey}`}
        aria-label="Скрыть окно"
        onClick={onHide}
      >
        <Minus />
      </IconButton>
    </div>
  );
}

function UpdateBadge({ update }: { update: NonNullable<StatusBarProps["update"]> }) {
  const availableTitle = `Доступна версия ${update.version}`;
  return (
    <Button
      variant="ghost"
      size="compact"
      onClick={update.onOpen}
      aria-label={availableTitle}
      title={update.busy ? `Обновление до ${update.version}…` : availableTitle}
      className="rounded-full font-mono text-muted-foreground"
    >
      <ArrowDownCircle className={cn("text-primary", update.busy && "animate-pulse")} />
      {update.version}
    </Button>
  );
}
