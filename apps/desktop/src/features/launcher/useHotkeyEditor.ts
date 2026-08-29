import { useCallback, useMemo, useState } from "react";
import type { SectionProps } from "@/features/settings/contract";
import type { HotkeyBinding } from "@/ipc/types";
import { assignHotkey, resetHotkey, type HotkeyAssignment } from "@/lib/hotkey-conflicts";
import { defaultCombo, type HotkeyActionId } from "@/lib/hotkeys";

export interface StolenHotkey {
  combo: string;
  from: HotkeyActionId;
  to: HotkeyActionId;
}

export interface HotkeyEditor {
  bindings: HotkeyBinding[];
  onAssign: (id: HotkeyActionId, combo: string) => void;
  onReset: (id: HotkeyActionId) => void;
  stolen: StolenHotkey | null;
}

export function useHotkeyEditor(
  draft: SectionProps["draft"],
  set: SectionProps["set"],
): HotkeyEditor {
  const [stolen, setStolen] = useState<StolenHotkey | null>(null);
  const bindings = draft.hotkeys;

  // `combo` is what the user ends up holding, which is why it is passed in rather
  // than read back out of the result: on a reset that is the default combination,
  // and the theft note names the combination, not the action it came from.
  const applied = useCallback(
    (id: HotkeyActionId, combo: string, result: HotkeyAssignment) => {
      const victim = result.stolenFrom[0];
      setStolen(victim === undefined ? null : { combo, from: victim, to: id });
      set("hotkeys", result.bindings);
    },
    [set],
  );

  const onAssign = useCallback(
    (id: HotkeyActionId, combo: string) => {
      applied(id, combo, assignHotkey(bindings, id, combo));
    },
    [applied, bindings],
  );

  const onReset = useCallback(
    (id: HotkeyActionId) => {
      applied(id, defaultCombo(id), resetHotkey(bindings, id));
    },
    [applied, bindings],
  );

  // The rows below are memoised, and they hold this object whole: rebuilding it
  // on every render of the tab would defeat every one of them.
  return useMemo(
    () => ({ bindings, onAssign, onReset, stolen }),
    [bindings, onAssign, onReset, stolen],
  );
}
