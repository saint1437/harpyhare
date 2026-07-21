import { ArrowDownCircle, Minus, Settings as SettingsIcon, X } from "lucide-react";
import type { ReactNode } from "react";
import { useWindowDrag } from "@/hooks/useWindowDrag";
import type { RecorderState } from "@/ipc/types";
import { cn } from "@/lib/utils";
import { EqBars, type EqBarsProps } from "./EqBars";

export interface StatusBarProps {
  state: RecorderState;
  error: string | null;
  toggleHotkey: string;
  tabs: ReactNode;
  update: { version: string; busy: boolean; onOpen: () => void } | null;
  onOpenSettings: () => void;
  onClose: () => void;
  onHide: () => void;
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
        className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-destructive"
      >
        {showError ? error : ""}
      </span>
      <div className="flex shrink-0 items-center gap-0.5">
        {update && <UpdateBadge update={update} />}
        <SettingsButton onClick={onOpenSettings} />
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
      <WindowButton
        label="Закрыть приложение"
        title="Закрыть приложение"
        onClick={onClose}
        hoverClass="hover:bg-destructive/15 hover:text-destructive"
      >
        <X className="size-3.5" />
      </WindowButton>
      <WindowButton
        label="Скрыть окно"
        title={`Скрыть окно — вернуть: ${toggleHotkey}`}
        onClick={onHide}
        hoverClass="hover:bg-white/5 hover:text-foreground"
      >
        <Minus className="size-3.5" />
      </WindowButton>
    </div>
  );
}

function WindowButton({
  label,
  title,
  onClick,
  hoverClass,
  children,
}: {
  label: string;
  title: string;
  onClick: () => void;
  hoverClass: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={title}
      className={cn(
        "grid size-6 place-items-center rounded-full text-muted-foreground transition-colors focus-visible:outline-2 focus-visible:outline-ring",
        hoverClass,
      )}
    >
      {children}
    </button>
  );
}

function UpdateBadge({ update }: { update: NonNullable<StatusBarProps["update"]> }) {
  const availableTitle = `Доступна версия ${update.version}`;
  return (
    <button
      type="button"
      onClick={update.onOpen}
      aria-label={availableTitle}
      title={update.busy ? `Обновление до ${update.version}…` : availableTitle}
      className="flex h-7 items-center gap-1.5 rounded-full px-2.5 font-mono text-[11.5px] text-primary transition-colors hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-ring"
    >
      <ArrowDownCircle className={cn("size-4", update.busy && "animate-pulse")} />
      {update.version}
    </button>
  );
}

function SettingsButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Настройки"
      className="grid size-7 place-items-center rounded-full text-muted-foreground transition-[color,background,transform] hover:rotate-45 hover:bg-white/5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
    >
      <SettingsIcon className="size-4" />
    </button>
  );
}
