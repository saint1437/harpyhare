import { useCallback, useEffect, useRef, type RefObject } from "react";
import { useLatestRef } from "@/hooks/useLatestRef";
import { onEvent } from "@/ipc/events";

export function usePromptFocus(suspended: boolean): RefObject<HTMLTextAreaElement | null> {
  const ref = useRef<HTMLTextAreaElement>(null);
  const suspendedRef = useLatestRef(suspended);

  const focus = useCallback(() => {
    const el = ref.current;
    if (suspendedRef.current || !el) return;
    el.focus();
    const caret = el.value.length;
    el.setSelectionRange(caret, caret);
  }, [suspendedRef]);

  useEffect(() => {
    if (suspended) ref.current?.blur();
    else focus();
  }, [suspended, focus]);

  useEffect(() => onEvent("focus-prompt", focus), [focus]);

  return ref;
}
