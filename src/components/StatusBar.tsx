import { Settings as SettingsIcon } from "lucide-react";
import type { RecorderState } from "@/ipc/types";
import { cn } from "@/lib/utils";

const STATUS_TEXT: Record<RecorderState, string> = {
  idle: "Зажми V — записать системный звук",
  recording: "Запись…",
  transcribing: "Распознаю…",
};

export interface StatusBarProps {
  state: RecorderState;
  error: string | null;
  onOpenSettings: () => void;
}

export function StatusBar({ state, error, onOpenSettings }: StatusBarProps) {
  const showError = error !== null && state === "idle";
  const dotClass =
    state === "recording"
      ? "bg-recording animate-pulse"
      : state === "transcribing"
        ? "bg-primary animate-pulse"
        : showError
          ? "bg-destructive"
          : "bg-muted-foreground";

  return (
    <header className="flex items-center justify-between gap-3 min-h-7">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className={cn("size-2.5 rounded-full shrink-0", dotClass)} aria-hidden />
        <span
          className={cn(
            "font-mono text-[12.5px] truncate",
            showError ? "text-destructive whitespace-normal" : "text-muted-foreground",
          )}
        >
          {showError ? error : STATUS_TEXT[state]}
        </span>
      </div>
      <button
        type="button"
        onClick={onOpenSettings}
        aria-label="Настройки"
        className="grid place-items-center size-7 rounded-full text-muted-foreground transition-[color,background,transform] hover:text-foreground hover:bg-white/5 hover:rotate-45 focus-visible:outline-2 focus-visible:outline-ring"
      >
        <SettingsIcon className="size-4" />
      </button>
    </header>
  );
}
