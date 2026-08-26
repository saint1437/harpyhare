import { useMemo } from "react";
import { effectiveCombos, type HotkeyCombos } from "@/lib/hotkeys";
import { useSettings } from "@/state/settings";

/**
 * Every action's effective combination, in ONE pass over the bindings per
 * settings change — instead of one scan per action per render. The HUD reads
 * nine of them, and while each panel called `effectiveCombo` for itself the
 * binding list was walked again on every render of every one of them.
 *
 * It is a hook rather than a prop so a panel can name the combo it prints
 * without the root threading it down; the memo is per component and costs
 * nothing, because the input is a stable array from the settings store.
 */
export function useHotkeyCombos(): HotkeyCombos {
  const hotkeys = useSettings().hotkeys;
  return useMemo(() => effectiveCombos(hotkeys), [hotkeys]);
}
