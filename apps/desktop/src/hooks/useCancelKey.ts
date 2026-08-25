import { useEffect, useMemo } from "react";
import { matchesPrepared, prepareCombo } from "@/lib/hotkey-match";

const KEYDOWN_EVENT = "keydown";

/** Что именно сейчас можно отменить. Порядок — приоритет. */
export type Cancellable = "recording" | "stream" | null;

export function cancellable(recording: boolean, streaming: boolean): Cancellable {
  if (recording) return "recording";
  if (streaming) return "stream";
  return null;
}

/**
 * Отмена жила только в глобальном хоткее, который регистрируется на время
 * записи, — а глобальная регистрация могла молча не встать (отказ ОС глушился
 * через `let _`), и тогда Escape не делал ничего. Плюс запрос отменить было
 * нечем вовсе: остановка висела только на кнопке в композере.
 *
 * Поэтому то же сочетание слушает и само окно. Сочетание берётся из реестра —
 * хардкод комбинаций в этом проекте запрещён.
 */
export function useCancelKey(
  combo: string,
  target: Cancellable,
  onCancelRecording: () => void,
  onCancelStream: () => void,
): void {
  const prepared = useMemo(() => prepareCombo(combo), [combo]);

  useEffect(() => {
    if (target === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (!matchesPrepared(e, prepared)) return;
      e.preventDefault();
      if (target === "recording") onCancelRecording();
      else onCancelStream();
    };
    document.addEventListener(KEYDOWN_EVENT, onKey);
    return () => {
      document.removeEventListener(KEYDOWN_EVENT, onKey);
    };
  }, [target, prepared, onCancelRecording, onCancelStream]);
}
