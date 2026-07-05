import { useEffect } from "react";
import { onEvent } from "@/ipc/events";

export function useTranscription(onText: (text: string) => void): void {
  useEffect(() => onEvent("transcript-ready", onText), [onText]);
}
