import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { onSaveError } from "@/lib/persist-errors";
import { createSaveQueue } from "@/lib/save-queue";
import { useLatestRef } from "./useLatestRef";

const SAVE_DEBOUNCE_MS = 500;

export function useDebouncedSave<T>(
  value: T,
  loaded: RefObject<boolean>,
  write: (value: T) => Promise<unknown>,
  subject: string,
): () => Promise<void> {
  const writeRef = useLatestRef(write);
  const onError = useLatestRef(onSaveError(subject));
  const [queue] = useState(() => createSaveQueue<T>((snapshot) => writeRef.current(snapshot)));
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
    return queue.flush();
  }, [queue]);

  useEffect(() => {
    if (!loaded.current) return;
    queue.stage(value);
    timer.current = setTimeout(() => {
      void flush().catch(onError.current);
    }, SAVE_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer.current);
    };
  }, [value, loaded, queue, flush, onError]);

  useEffect(
    () => () => {
      void flush().catch(onError.current);
    },
    [flush, onError],
  );

  return flush;
}
