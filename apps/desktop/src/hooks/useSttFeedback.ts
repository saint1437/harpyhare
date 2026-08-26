import { useCallback, useEffect, useState } from "react";
import { retryTranscription } from "@/ipc/commands";
import { onEvent } from "@/ipc/events";
import type { RecorderState } from "@/ipc/types";
import { isRetryable } from "@/lib/errors";
import { notifyAppError } from "@/lib/notifications";

export interface SttFeedback {
  showRetry: boolean;
  clearFeedback: () => void;
  retry: () => void;
}

/**
 * Текст отказа распознавания ушёл в уведомление, а здесь осталось то, чем
 * уведомление быть не может: кнопка «Повторить» в композере живёт до тех пор,
 * пока не появится расшифровка, — а уведомление по определению временное.
 */
export function useSttFeedback(state: RecorderState): SttFeedback {
  const [showRetry, setShowRetry] = useState(false);

  useEffect(
    () =>
      onEvent("stt-error", (err) => {
        notifyAppError(err);
        setShowRetry(isRetryable(err));
      }),
    [],
  );

  useEffect(() => {
    if (state === "recording") setShowRetry(false);
  }, [state]);

  const clearFeedback = useCallback(() => {
    setShowRetry(false);
  }, []);

  const retry = useCallback(() => {
    setShowRetry(false);
    void retryTranscription();
  }, []);

  return { showRetry, clearFeedback, retry };
}
