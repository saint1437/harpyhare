import { useEffect, useMemo } from "react";
import { matchesPrepared, prepareCombo } from "@/lib/hotkey-match";

const KEYDOWN_EVENT = "keydown";

export function useComboKey(combo: string, enabled: boolean, onTrigger: () => void): void {
  const prepared = useMemo(() => prepareCombo(combo), [combo]);

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.defaultPrevented) return;
      if (!matchesPrepared(e, prepared)) return;
      e.preventDefault();
      onTrigger();
    };
    document.addEventListener(KEYDOWN_EVENT, onKey);
    return () => {
      document.removeEventListener(KEYDOWN_EVENT, onKey);
    };
  }, [enabled, prepared, onTrigger]);
}
