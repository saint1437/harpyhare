import { useMemo } from "react";
import type { QuickAction } from "@/ipc/types";
import { filledQuickActions } from "@/lib/quick-actions";
import { useSettings, useSettingsLoading } from "@/state/settings";

/**
 * The quick actions as both the row and the hotkeys see them — one list, so
 * ⌘2 in the settings and ⌘2 on the button are the same action. The filter is
 * `filledQuickActions` (title AND prompt), and the numbering follows it.
 *
 * The `loading` gate is not cosmetic: without it the seeds from
 * `SETTINGS_DEFAULTS` show up at start and vanish once `get_settings` answers,
 * jolting the composer's height.
 */
export function useQuickActions(): QuickAction[] {
  const actions = useSettings().quick_actions;
  const loading = useSettingsLoading();
  return useMemo(() => (loading ? [] : filledQuickActions(actions)), [loading, actions]);
}
