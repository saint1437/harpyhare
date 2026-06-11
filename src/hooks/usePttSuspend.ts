import { useEffect } from "react";
import { setPttSuspended } from "@/ipc/commands";

/**
 * Хоткей V конфликтует с печатью «V» в textarea/input — на время фокуса в полях
 * глушим PTT. Вешаем на document (focusin/focusout) и проверяем target.
 */
export function usePttSuspend(): void {
  useEffect(() => {
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
    };
  }, []);
}
