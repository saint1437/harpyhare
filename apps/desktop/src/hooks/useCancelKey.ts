import { useMemo } from "react";
import { useDocumentKeydown } from "@/hooks/useDocumentKeydown";
import { matchesPrepared, prepareCombo } from "@/lib/hotkey-match";

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

  useDocumentKeydown((e) => {
    // Radix layers (popovers, dialogs) consume Escape in the document's
    // capture phase and mark it preventDefault — that Esc closed a layer, it
    // was not cancelling the recording or the stream. Without the check,
    // closing the params popover killed the stream mid-answer.
    if (e.defaultPrevented) return;
    if (e.repeat) return;
    if (!matchesPrepared(e, prepared)) return;
    e.preventDefault();
    if (target === "recording") onCancelRecording();
    else onCancelStream();
  }, target !== null);
}
