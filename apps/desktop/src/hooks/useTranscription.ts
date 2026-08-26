import { useEffect } from "react";
import { useLatestRef } from "@/hooks/useLatestRef";
import { onEvent } from "@/ipc/events";

/**
 * The callback rides in a ref so the Tauri subscription is registered once per
 * window: `listen` resolves asynchronously, so re-subscribing on a new handler
 * identity opens a window in which a `transcript-ready` event has no listener
 * at all and the dictation is lost.
 */
export function useTranscription(onText: (text: string) => void): void {
  const onTextRef = useLatestRef(onText);
  useEffect(
    () =>
      onEvent("transcript-ready", (text) => {
        onTextRef.current(text);
      }),
    [onTextRef],
  );
}
