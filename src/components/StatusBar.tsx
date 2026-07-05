import { ArrowDownCircle, Settings as SettingsIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { RecorderState } from "@/ipc/types";
import { cn } from "@/lib/utils";

export interface StatusBarProps {
  state: RecorderState;
  error: string | null;
  hotkey: string;
  /** Глобальный хоткей показа окна — подсказка на кнопке «Скрыть». */
  toggleHotkey: string;
  tabs: ReactNode;
  /** Доступное обновление: ненавязчивый бейдж слева от настроек (null — нет). */
  update: { version: string; busy: boolean; onOpen: () => void } | null;
  onOpenSettings: () => void;
  onClose: () => void;
  onHide: () => void;
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
    // data-tauri-drag-region: пустые места шапки таскают окно (кнопки/табы кликабельны,
    // т.к. Tauri проверяет атрибут строго на target события).
    <header className="flex flex-col gap-1.5" data-tauri-drag-region>
      <div className="flex min-h-7 items-center justify-between gap-2" data-tauri-drag-region>
        <div className="no-scrollbar flex min-w-0 items-center gap-2 overflow-x-auto">
          <div className="group flex shrink-0 items-center gap-1.5 pr-1">
            <button
              type="button"
              onClick={onClose}
              aria-label="Закрыть приложение"
              title="Закрыть приложение"
              className="grid size-3 place-items-center rounded-full bg-[#ff5f57] text-[8px] leading-none font-bold text-black/0 transition-colors group-hover:text-black/50 hover:brightness-90"
            >
              ×
            </button>
            <button
              type="button"
              onClick={onHide}
              aria-label="Скрыть окно"
              title={`Скрыть окно — вернуть: ${toggleHotkey}`}
              className="grid size-3 place-items-center rounded-full bg-[#febc2e] text-[8px] leading-none font-bold text-black/0 transition-colors group-hover:text-black/50 hover:brightness-90"
            >
              −
            </button>
          </div>
          <span className={cn("size-2.5 shrink-0 rounded-full", dotClass)} aria-hidden />
          {tabs}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {update && (
            <button
              type="button"
              onClick={update.onOpen}
              aria-label={`Доступна версия ${update.version}`}
              title={
                update.busy
                  ? `Обновление до ${update.version}…`
                  : `Доступна версия ${update.version}`
              }
              className="flex h-7 items-center gap-1.5 rounded-full px-2.5 font-mono text-[11.5px] text-primary transition-colors hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-ring"
            >
              <ArrowDownCircle className={cn("size-4", update.busy && "animate-pulse")} />
              {update.version}
            </button>
          )}
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="Настройки"
            className="grid size-7 place-items-center rounded-full text-muted-foreground transition-[color,background,transform] hover:rotate-45 hover:bg-white/5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <SettingsIcon className="size-4" />
          </button>
        </div>
      </div>
      <span
        className={cn(
          "truncate font-mono text-[11.5px]",
          showError ? "whitespace-normal text-destructive" : "text-muted-foreground",
        )}
        data-tauri-drag-region
      >
        {showError ? error : statusText[state]}
      </span>
    </header>
  );
}
