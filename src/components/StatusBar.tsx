import type { ReactNode } from "react";
import { Settings as SettingsIcon } from "lucide-react";
import type { RecorderState } from "@/ipc/types";
import { cn } from "@/lib/utils";

export interface StatusBarProps {
  state: RecorderState;
  error: string | null;
  hotkey: string;
  tabs: ReactNode;
  onOpenSettings: () => void;
}

export function StatusBar({ state, error, hotkey, tabs, onOpenSettings }: StatusBarProps) {
  const statusText: Record<RecorderState, string> = {
    idle: `Зажми ${hotkey} — записать системный звук`,
    recording: "Запись…",
    transcribing: "Распознаю…",
  };
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
    <header className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2 min-h-7">
        <div className="flex items-center gap-2 min-w-0 overflow-x-auto no-scrollbar">
          <span className={cn("size-2.5 rounded-full shrink-0", dotClass)} aria-hidden />
          {tabs}
        </div>
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Настройки"
          className="grid place-items-center size-7 shrink-0 rounded-full text-muted-foreground transition-[color,background,transform] hover:text-foreground hover:bg-white/5 hover:rotate-45 focus-visible:outline-2 focus-visible:outline-ring"
        >
          <SettingsIcon className="size-4" />
        </button>
      </div>
      <span
        className={cn(
          "font-mono text-[11.5px] truncate",
          showError ? "text-destructive whitespace-normal" : "text-muted-foreground",
        )}
      >
        {showError ? error : statusText[state]}
      </span>
    </header>
  );
}
