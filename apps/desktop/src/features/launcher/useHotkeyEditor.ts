import { useState } from "react";
import type { HotkeyBinding } from "@/ipc/types";
import { assignHotkey, resetHotkey } from "@/lib/hotkey-conflicts";
import { defaultCombo, type HotkeyActionId } from "@/lib/hotkeys";
import type { SectionProps } from "./contract";

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

  const apply = (id: HotkeyActionId, combo: string, reset: boolean) => {
    const result = reset ? resetHotkey(draft.hotkeys, id) : assignHotkey(draft.hotkeys, id, combo);
    const victim = result.stolenFrom[0];
    setStolen(victim === undefined ? null : { combo, from: victim, to: id });
    set("hotkeys", result.bindings);
  };

  return {
    bindings: draft.hotkeys,
    onAssign: (id, combo) => {
      apply(id, combo, false);
    },
    onReset: (id) => {
      apply(id, defaultCombo(id), true);
    },
    stolen,
  };
}
