import { useEffect } from "react";
import { setPttSuspended } from "@/ipc/commands";
import { conflictsWithTyping } from "@/lib/hotkey-capture";

/**
 * Буквенный хоткей (например «V») конфликтует с печатью в textarea/input — на время
 * фокуса в полях глушим PTT. Хоткеи, не мешающие печати (F9, Cmd+…), НЕ глушатся:
 * запись должна стартовать и при фокусе в поле промпта.
 */
export function usePttSuspend(hotkey: string): void {
  useEffect(() => {
    if (!conflictsWithTyping(hotkey)) return;
    const isField = (t: EventTarget | null): boolean =>
      t instanceof HTMLElement && (t.matches("textarea, input") || t.isContentEditable);
    const onIn = (e: FocusEvent) => {
      if (isField(e.target)) void setPttSuspended(true);
    };
    const onOut = (e: FocusEvent) => {
      if (isField(e.target)) void setPttSuspended(false);
    };
    document.addEventListener("focusin", onIn);
    document.addEventListener("focusout", onOut);
    return () => {
      document.removeEventListener("focusin", onIn);
      document.removeEventListener("focusout", onOut);
      // хоткей сменился/размонтирование при фокусе в поле — не оставляем PTT заглушённым
      void setPttSuspended(false);
    };
  }, [hotkey]);
}
