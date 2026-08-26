import { ArrowDownCircle, Minimize2, Power, Square } from "lucide-react";
import type { ReactNode } from "react";
import { IconButton } from "@/components/IconButton";
import { LiveRegion } from "@/components/LiveRegion";
import { Button } from "@/components/ui/button";
import { useDict } from "@/hooks/useDict";
import { useHotkeyCombos } from "@/hooks/useHotkeyCombos";
import { useWindowDrag } from "@/hooks/useWindowDrag";
import { format, type Dictionary } from "@/i18n";
import { closeApp, setWindowCollapsed, stopMainWindow } from "@/ipc/commands";
import { formatCombo } from "@/lib/hotkeys";
import type { ListeningState } from "@/lib/listening";
import { cn } from "@/lib/utils";
import { useSettings } from "@/state/settings";
import { ListeningStatus } from "./ListeningStatus";

export interface ContextUsage {
  usedTokens: number;
  maxTokens: number;
}

/**
 * Six props, and two of them are composition slots. What used to be thirteen
 * was mostly state this header can read for itself: the pause flag comes from
 * the settings slice, the "how do I get the window back" combo from the hotkey
 * registry, and the three window verbs are Rust commands — `set_window_size`
 * and friends do nothing from JS without a capability, so they were never
 * callbacks worth threading down.
 *
 * `listening` stays a prop because it is a JOIN: the recorder's state, auto
 * mode and the notification stack all feed `listeningState`, and two of those
 * are hooks that must exist exactly once in the window. `update` and
 * `contextUsage` stay for the same reason — `useUpdater` and the token
 * projection are single-instance.
 */
export interface StatusBarProps {
  listening: ListeningState;
  tabs: ReactNode;
  actions: ReactNode;
  contextUsage: ContextUsage | null;
  update: { version: string; busy: boolean; onOpen: () => void } | null;
  onTogglePause: () => void;
}

const CONTEXT_USAGE_WARN_PERCENT = 80;
const CONTEXT_GAUGE_MIN_FILL_PERCENT = 3;
const PERCENT_SCALE = 100;

function ContextUsageGauge({ usage }: { usage: ContextUsage }) {
  const dict = useDict();
  const percent = Math.min(
    PERCENT_SCALE,
    Math.round((usage.usedTokens / usage.maxTokens) * PERCENT_SCALE),
  );
  // The grouping separator follows the interface, not the build: a Russian UI
  // reads 128 000 and an English one 128,000.
  const title = format(dict.hud.statusBar.contextUsage, {
    used: usage.usedTokens.toLocaleString(dict.locale),
    max: usage.maxTokens.toLocaleString(dict.locale),
  });
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
 * Not `withComboHint`: the combination here RESTORES the window rather than
 * collapsing it, so the sentence names what it does. What is shared is the
 * guard — a stolen binding leaves `effectiveCombo` empty, and this used to
 * print the restore hint with nothing after the colon.
 */
function collapseTitle(toggleHotkey: string, dict: Dictionary): string {
  const copy = dict.hud.statusBar;
  const combo = formatCombo(toggleHotkey);
  return combo === ""
    ? copy.collapse
    : format(copy.collapseRestore, { label: copy.collapse, combo });
}

export function StatusBar({
  listening,
  tabs,
  actions,
  contextUsage,
  update,
  onTogglePause,
}: StatusBarProps) {
  const dict = useDict();
  const copy = dict.hud.statusBar;
  const onDragMouseDown = useWindowDrag();
  const bufferEnabled = useSettings().buffer_enabled;
  const toggleHotkey = useHotkeyCombos().toggle_window;

  return (
    <header className="flex min-h-7 items-center gap-2" onMouseDown={onDragMouseDown}>
      {/* Объявляется только состояние захвата: текст отказа теперь несёт
          NotificationStack со своей живой областью. */}
      <LiveRegion message={dict.common.listening[listening].announcement} />
      <ListeningStatus value={listening} paused={!bufferEnabled} onTogglePause={onTogglePause} />
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
          title={collapseTitle(toggleHotkey, dict)}
          aria-label={copy.collapse}
          onClick={() => void setWindowCollapsed(true, false)}
        >
          <Minimize2 />
        </IconButton>
        <IconButton title={copy.stop} onClick={() => void stopMainWindow()}>
          <Square />
        </IconButton>
        {/* Окно без рамки, без трея и без строки меню: до этой кнопки выйти из
            приложения было физически нечем — команда close_app существовала в
            контракте и не вызывалась ниоткуда. */}
        <IconButton title={copy.quit} onClick={() => void closeApp()}>
          <Power />
        </IconButton>
      </div>
    </header>
  );
}

function UpdateBadge({ update }: { update: NonNullable<StatusBarProps["update"]> }) {
  const copy = useDict().hud.update;
  const version = { version: update.version };
  const availableTitle = format(copy.available, version);
  return (
    <Button
      variant="ghost"
      size="compact"
      onClick={update.onOpen}
      aria-label={availableTitle}
      title={update.busy ? format(copy.installing, version) : availableTitle}
      className="font-mono text-fg-subtle tabular-nums"
    >
      <ArrowDownCircle className={cn("text-accent-mark", update.busy && "animate-pulse")} />
      {update.version}
    </Button>
  );
}
