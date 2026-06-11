import { Settings as SettingsIcon } from "lucide-react";
import type { ReactNode } from "react";
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
      <div className="flex min-h-7 items-center justify-between gap-2">
        <div className="no-scrollbar flex min-w-0 items-center gap-2 overflow-x-auto">
          <span className={cn("size-2.5 shrink-0 rounded-full", dotClass)} aria-hidden />
          {tabs}
        </div>
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Настройки"
          className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-[color,background,transform] hover:rotate-45 hover:bg-white/5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          <SettingsIcon className="size-4" />
        </button>
      </div>
      <span
        className={cn(
          "truncate font-mono text-[11.5px]",
          showError ? "whitespace-normal text-destructive" : "text-muted-foreground",
        )}
      >
        {showError ? error : statusText[state]}
      </span>
    </header>
  );
}
