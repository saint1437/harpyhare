import { useEffect } from "react";
import { setPttSuspended } from "@/ipc/commands";
import { conflictsWithTyping } from "@/lib/hotkey-capture";

const FOCUS_IN_EVENT = "focusin";
const FOCUS_OUT_EVENT = "focusout";
const TEXT_FIELD_SELECTOR = "textarea, input";

function isTextField(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.matches(TEXT_FIELD_SELECTOR) || target.isContentEditable)
  );
}

export function usePttSuspend(hotkey: string): void {
  useEffect(() => {
    if (!conflictsWithTyping(hotkey)) return;
    const suspendOnFieldFocus = (e: FocusEvent) => {
      if (isTextField(e.target)) void setPttSuspended(true);
    };
    const resumeOnFieldBlur = (e: FocusEvent) => {
      if (isTextField(e.target)) void setPttSuspended(false);
    };
    document.addEventListener(FOCUS_IN_EVENT, suspendOnFieldFocus);
    document.addEventListener(FOCUS_OUT_EVENT, resumeOnFieldBlur);
    return () => {
      document.removeEventListener(FOCUS_IN_EVENT, suspendOnFieldFocus);
      document.removeEventListener(FOCUS_OUT_EVENT, resumeOnFieldBlur);
      void setPttSuspended(false);
    };
  }, [hotkey]);
}
