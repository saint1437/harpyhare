import { Pause, Play } from "lucide-react";
import { IconButton } from "@/components/IconButton";
import { listeningPresentation, type ListeningState } from "@/lib/listening";
import { cn } from "@/lib/utils";
import { CaptureMeter } from "./CaptureMeter";

/**
 * Слово «Ошибка» здесь есть, а текста ошибки нет — и это не потеря. Он стоял тут
 * обрезанным до 64 символов с полным вариантом в `title`, то есть сообщение,
 * ради которого всё и затевалось, читалось только наведением мыши. Теперь его
 * несёт уведомление, а строка захвата отвечает ровно за свой вопрос.
 *
 * Pause stops everything PASSIVE — the ring buffer and auto mode. Push-to-talk
 * stays live on purpose: holding a key is not passive listening, and taking it
 * away would make the pause a second Stop.
 */
export function ListeningStatus({
  value,
  paused,
  onTogglePause,
}: {
  value: ListeningState;
  paused: boolean;
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
