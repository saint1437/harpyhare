import { useCallback, useEffect, useRef, type RefObject } from "react";
import { useLatestRef } from "@/hooks/useLatestRef";
import { onEvent } from "@/ipc/events";

/**
 * `collapsed` здесь не для красоты: пока окно свёрнуто в клубок, композер
 * размонтирован, и `ref.current` равен null. При разворачивании он монтируется
 * заново, но эффект ниже сам по себе не перезапустился бы — ни `suspended`, ни
 * `focus` не изменились, — и каретка не возвращалась.
 *
 * Полагаться на событие `focus-prompt` из Rust тут нельзя: оно пришло бы раньше,
 * чем ref успевает прицепиться. А так эффект родителя выполняется уже ПОСЛЕ
 * коммита ребёнка, когда ref на месте.
 */
export function usePromptFocus(
  suspended: boolean,
  collapsed = false,
): RefObject<HTMLTextAreaElement | null> {
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
    if (suspended || collapsed) ref.current?.blur();
    else focus();
  }, [suspended, collapsed, focus]);

  useEffect(() => onEvent("focus-prompt", focus), [focus]);

  return ref;
}
