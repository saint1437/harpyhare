import type { Settings } from "@/ipc/types";
import { isPresetFilled } from "@/lib/presets";
import { isQuickActionFilled } from "@/lib/quick-actions";

export function normalizeDraft(draft: Settings): Settings {
  return {
    ...draft,
    prompt_presets: draft.prompt_presets.filter(isPresetFilled),
    quick_actions: draft.quick_actions.filter(isQuickActionFilled),
  };
}
