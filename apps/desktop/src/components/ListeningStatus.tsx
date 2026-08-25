import { Pause, Play } from "lucide-react";
import { IconButton } from "@/components/IconButton";
import { listeningPresentation, type ListeningState } from "@/lib/listening";
import { cn } from "@/lib/utils";
import { CaptureMeter } from "./CaptureMeter";

/**
 * Pause stops everything PASSIVE — the ring buffer and auto mode. Push-to-talk
 * stays live on purpose: holding a key is not passive listening, and taking it
 * away would make the pause a second Stop.
 */
export function ListeningStatus({
  value,
  paused,
  error,
  onTogglePause,
}: {
  value: ListeningState;
  paused: boolean;
  error?: string | null;
  onTogglePause: () => void;
}) {
  const { tone, animated, word } = listeningPresentation(value);
  return (
    // Опаковая подложка — не украшение. Оболочка HUD полупрозрачна, и над
    // произвольным рабочим столом ни один цвет не гарантирует контраст: при
    // допустимом минимуме 0.75 над белым фоном «listening-dim» даёт 1.91:1, а
    // «danger» — 2.74:1. Единственное, что приложение обещает всегда держать
    // читаемым, — ответ на вопрос «меня сейчас слышно?», поэтому он и получает
    // собственную непрозрачную поверхность.
    <span className="flex min-w-0 shrink-0 items-center gap-1.5 rounded-md bg-surface px-1.5 py-0.5 ring-1 ring-inset ring-line">
      <CaptureMeter tone={tone} animated={animated} />
      <span
        className={cn(
          "text-caption whitespace-nowrap",
          value === "error" ? "text-danger" : value === "off" ? "text-fg-subtle" : "text-fg",
        )}
      >
        {word}
      </span>
      {error != null && error !== "" && (
        <span className="max-w-64 min-w-0 truncate text-caption text-danger" title={error}>
          {error}
        </span>
      )}
      <IconButton
        title={
          paused
            ? "Слушать — включить фоновый буфер"
            : "Пауза — выключить фоновый буфер и автослушание"
        }
        aria-label={paused ? "Возобновить прослушивание" : "Поставить прослушивание на паузу"}
        onClick={onTogglePause}
      >
        {paused ? <Play /> : <Pause />}
      </IconButton>
    </span>
  );
}
