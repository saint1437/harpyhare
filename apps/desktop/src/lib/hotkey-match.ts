import { matchesModifier, parseModifier, type ModifierState } from "./hotkey-modifier";
import { canonicalKey, splitCombo } from "./hotkeys";

export interface PreparedCombo {
  modifiers: ModifierState;
  key: string | null;
}

export interface KeyboardComboEvent {
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  code: string;
}

export function prepareCombo(combo: string): PreparedCombo {
  const { key } = splitCombo(combo);
  return {
    modifiers: parseModifier(combo),
    key: key === null ? null : canonicalKey(key),
  };
}

export function matchesPrepared(event: KeyboardComboEvent, prepared: PreparedCombo): boolean {
  if (prepared.key === null) return false;
  if (canonicalKey(event.code) !== prepared.key) return false;
  return matchesModifier(event, prepared.modifiers);
}
