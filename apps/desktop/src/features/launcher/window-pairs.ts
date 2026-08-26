import type { WindowPairKey } from "@/i18n/launcher-types";
import { SETTINGS_LIMITS } from "@/ipc/types";
import type { Settings } from "@/ipc/types";

interface WindowPair {
  action: WindowPairKey;
  stepKey: keyof Settings;
  limits: { min: number; max: number };
}

/**
 * A modifier and its step are configured together — they only work in a pair.
 *
 * The registry lives in its own module rather than inside `WindowSection` for the
 * same reason `PERMISSION_ROWS` does: it has a second consumer (the launcher's
 * search index, which must offer exactly the rows the section renders), and
 * exporting data from a file that holds a component breaks fast refresh.
 * The hints used to be typed out twice, and a reworded section left the search
 * matching a sentence no longer on screen. Since the app went bilingual they are
 * not here at all: `dict.launcher.window.pairs`, keyed by the same action.
 */
export const WINDOW_PAIRS = [
  {
    action: "move_window",
    stepKey: "move_step",
    limits: SETTINGS_LIMITS.moveStep,
  },
  {
    action: "resize_window",
    stepKey: "resize_step",
    limits: SETTINGS_LIMITS.resizeStep,
  },
  {
    action: "scroll_chat",
    stepKey: "scroll_step",
    limits: SETTINGS_LIMITS.scrollStep,
  },
] as const satisfies readonly WindowPair[];
