import { useEffect } from "react";
import { onEvent } from "@/ipc/events";

/** Вызывает onText при transcript-ready. Колбэк кладёт текст в composer и (если auto_send) шлёт. */
export function useTranscription(onText: (text: string) => void): void {
  useEffect(() => onEvent("transcript-ready", onText), [onText]);
}
