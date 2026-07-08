import { ArrowDownCircle, Minus, Settings as SettingsIcon, X } from "lucide-react";
import type { ReactNode } from "react";
import { useWindowDrag } from "@/hooks/useWindowDrag";
import type { RecorderState } from "@/ipc/types";
import { cn } from "@/lib/utils";

export interface StatusBarProps {
  state: RecorderState;
  error: string | null;
  hotkey: string;
  toggleHotkey: string;
  tabs: ReactNode;
  update: { version: string; busy: boolean; onOpen: () => void } | null;
  onOpenSettings: () => void;
  onClose: () => void;
  onHide: () => void;
}

function statusTextFor(state: RecorderState, hotkey: string): string {
  const texts: Record<RecorderState, string> = {
    idle: `Зажми ${hotkey} — записать системный звук`,
    recording: "Запись…",
    transcribing: "Распознаю…",
  };
  return texts[state];
}

function statusDotClass(state: RecorderState, showError: boolean): string {
  if (state === "recording") return "bg-recording animate-pulse";
  if (state === "transcribing") return "bg-primary animate-pulse";
  return showError ? "bg-destructive" : "bg-muted-foreground";
}

export function StatusBar({
  state,
  error,
  hotkey,
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
    <header className="flex flex-col gap-1.5" onMouseDown={onDragMouseDown}>
      <div className="flex min-h-7 items-center justify-between gap-2">
        <div className="no-scrollbar flex min-w-0 items-center gap-2 overflow-x-auto">
          <WindowButtons toggleHotkey={toggleHotkey} onClose={onClose} onHide={onHide} />
          <span
            className={cn("size-2.5 shrink-0 rounded-full", statusDotClass(state, showError))}
            aria-hidden
          />
          {tabs}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {update && <UpdateBadge update={update} />}
          <SettingsButton onClick={onOpenSettings} />
        </div>
      </div>
      <span
        className={cn(
          "truncate font-mono text-[11.5px]",
          showError ? "whitespace-normal text-destructive" : "text-muted-foreground",
        )}
      >
        {showError ? error : statusTextFor(state, hotkey)}
      </span>
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
