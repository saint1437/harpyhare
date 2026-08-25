import { ArrowDownCircle, Minus, Square } from "lucide-react";
import type { ReactNode } from "react";
import { IconButton } from "@/components/IconButton";
import { Button } from "@/components/ui/button";
import { useWindowDrag } from "@/hooks/useWindowDrag";
import type { RecorderState } from "@/ipc/types";
import { formatCombo } from "@/lib/hotkeys";
import { cn } from "@/lib/utils";
import { CaptureMeter, type CaptureMeterProps } from "./CaptureMeter";

export interface ContextUsage {
  usedTokens: number;
  maxTokens: number;
}

export interface StatusBarProps {
  state: RecorderState;
  autoListening: boolean;
  error: string | null;
  toggleHotkey: string;
  tabs: ReactNode;
  actions: ReactNode;
  contextUsage: ContextUsage | null;
  update: { version: string; busy: boolean; onOpen: () => void } | null;
  onStop: () => void;
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
            "block h-full rounded-full transition-[width] duration-300",
            percent >= CONTEXT_USAGE_WARN_PERCENT ? "bg-danger" : "bg-fg-subtle/60",
          )}
          style={{ width: `${String(Math.max(CONTEXT_GAUGE_MIN_FILL_PERCENT, percent))}%` }}
        />
      </span>
      <span className="text-hint text-fg-subtle tabular-nums">{percent}%</span>
    </div>
  );
}

/**
 * `listening` is the only chromatic capture signal in the product, and it means
 * exactly one thing: sound is going somewhere right now. Transcribing is work,
 * not capture, so it is deliberately neutral and carries its meaning in motion
 * and in the word beside it.
 */
function captureIndicator(
  state: RecorderState,
  autoListening: boolean,
  showError: boolean,
): CaptureMeterProps {
  if (state === "recording") return { tone: "listening", animated: true };
  if (state === "transcribing") return { tone: "processing", animated: true };
  if (autoListening) return { tone: "listening", animated: true };
  return { tone: showError ? "danger" : "idle", animated: false };
}

export function StatusBar({
  state,
  autoListening,
  error,
  toggleHotkey,
  tabs,
  actions,
  contextUsage,
  update,
  onStop,
  onHide,
}: StatusBarProps) {
  const showError = error !== null && state === "idle";
  const onDragMouseDown = useWindowDrag();

  return (
    <header className="flex min-h-7 items-center gap-2" onMouseDown={onDragMouseDown}>
      <IconButton
        title={`Скрыть окно — вернуть: ${formatCombo(toggleHotkey)}`}
        aria-label="Скрыть окно"
        onClick={onHide}
      >
        <Minus />
      </IconButton>
      <CaptureMeter {...captureIndicator(state, autoListening, showError)} />
      {tabs}
      <span
        title={showError ? error : undefined}
        className="min-w-0 flex-1 truncate text-caption text-danger"
      >
        {showError ? error : ""}
      </span>
      <div className="flex shrink-0 items-center gap-0.5">
        {contextUsage && <ContextUsageGauge usage={contextUsage} />}
        {actions}
        {update && <UpdateBadge update={update} />}
        <IconButton title="Стоп — вернуться в лаунчер" onClick={onStop}>
          <Square />
        </IconButton>
      </div>
    </header>
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
      className="font-mono text-fg-subtle tabular-nums"
    >
      <ArrowDownCircle className={cn("text-accent-mark", update.busy && "animate-pulse")} />
      {update.version}
    </Button>
  );
}
