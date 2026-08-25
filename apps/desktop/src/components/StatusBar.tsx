import { ArrowDownCircle, Minimize2, Power, Square } from "lucide-react";
import type { ReactNode } from "react";
import { IconButton } from "@/components/IconButton";
import { Button } from "@/components/ui/button";
import { useWindowDrag } from "@/hooks/useWindowDrag";
import type { RecorderState } from "@/ipc/types";
import { formatCombo } from "@/lib/hotkeys";
import { listeningAnnouncement, listeningState } from "@/lib/listening";
import { cn } from "@/lib/utils";
import { ListeningStatus } from "./ListeningStatus";
import { LiveRegion } from "./LiveRegion";

export interface ContextUsage {
  usedTokens: number;
  maxTokens: number;
}

export interface StatusBarProps {
  state: RecorderState;
  autoListening: boolean;
  bufferEnabled: boolean;
  error: string | null;
  toggleHotkey: string;
  tabs: ReactNode;
  actions: ReactNode;
  contextUsage: ContextUsage | null;
  update: { version: string; busy: boolean; onOpen: () => void } | null;
  onStop: () => void;
  onCollapse: () => void;
  onTogglePause: () => void;
  onQuit: () => void;
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

export function StatusBar({
  state,
  autoListening,
  bufferEnabled,
  error,
  toggleHotkey,
  tabs,
  actions,
  contextUsage,
  update,
  onStop,
  onCollapse,
  onTogglePause,
  onQuit,
}: StatusBarProps) {
  // Раньше ошибка показывалась только в простое, то есть отказ во время
  // записи пропадал совсем. Теперь у захвата и у ошибки разные слоты.
  const showError = error !== null;
  const onDragMouseDown = useWindowDrag();
  const listening = listeningState({
    state,
    autoListening,
    bufferEnabled,
    hasError: showError,
  });

  return (
    <header className="flex min-h-7 items-center gap-2" onMouseDown={onDragMouseDown}>
      <LiveRegion message={showError ? error : listeningAnnouncement(listening)} />
      <ListeningStatus
        value={listening}
        paused={!bufferEnabled}
        error={showError ? error : null}
        onTogglePause={onTogglePause}
      />
      {tabs}
      <span className="min-w-0 flex-1" />
      {/* Инструменты приглушены и стоят вместе; цвет остаётся только у
          индикаторов состояния внутри `actions`. */}
      <div className="flex shrink-0 items-center gap-0.5">
        {contextUsage && <ContextUsageGauge usage={contextUsage} />}
        {actions}
        {update && <UpdateBadge update={update} />}
      </div>

      {/* Управление окном — за волоском и на задний план: это самое редкое,
          что тут есть, а весило столько же, сколько всё остальное. */}
      <div className="ml-1 flex shrink-0 items-center gap-0.5 border-l border-line pl-1.5">
        <IconButton
          title={`Свернуть в клубок — вернуть: ${formatCombo(toggleHotkey)}`}
          aria-label="Свернуть в клубок"
          onClick={onCollapse}
        >
          <Minimize2 />
        </IconButton>
        <IconButton title="Стоп — вернуться в лаунчер" onClick={onStop}>
          <Square />
        </IconButton>
        {/* Окно без рамки, без трея и без строки меню: до этой кнопки выйти из
            приложения было физически нечем — команда close_app существовала в
            контракте и не вызывалась ниоткуда. */}
        <IconButton title="Выйти из приложения" onClick={onQuit}>
          <Power />
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
