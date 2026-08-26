import { HOTKEY_ACTIONS } from "@/ipc/types";

/**
 * The keys come straight from the generated registry rather than from
 * `lib/hotkeys` — which derives the same unions — so that `lib/hotkeys` can
 * take a `Dictionary` without the two files forming a cycle.
 *
 * `HOTKEY_ACTIONS` is printed `as const`, so `labelKey` and `groupKey` are
 * literal unions: the two records below are exhaustive by the compiler, and an
 * action added in `hotkeys.rs` fails `tsc` until both locales describe it.
 */
type Action = (typeof HOTKEY_ACTIONS)[number];

export type HotkeyLabelKey = Action["labelKey"];
export type HotkeyGroupKey = Action["groupKey"];

export interface HotkeyCopy {
  /** What the row in the settings calls the action. */
  label: string;
  /** The sentence under it, and what the search index matches on. */
  hint: string;
}

export interface HotkeysCopy {
  groups: Record<HotkeyGroupKey, string>;
  actions: Record<HotkeyLabelKey, HotkeyCopy>;
  /**
   * The three text-field behaviours that are deliberately NOT configurable —
   * send, newline, paste — shown in the HUD's reference beside the real ones.
   */
  fieldHints: { send: string; newline: string; paste: string };
  /** Printed in place of the hint while an action has no combination. */
  unassigned: string;
}
