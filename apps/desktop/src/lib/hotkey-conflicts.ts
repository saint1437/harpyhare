import { HOTKEY_ACTIONS } from "@/ipc/bindings";
import type { HotkeyBinding } from "@/ipc/types";
import {
  canonicalKey,
  defaultCombo,
  effectiveCombo,
  hotkeyAction,
  sortedModifiers,
  splitCombo,
  type HotkeyAction,
  type HotkeyActionId,
} from "./hotkeys";
import { isQuickActionDigit } from "./quick-actions";

const ARROW_KEYS = ["ARROWLEFT", "ARROWRIGHT", "ARROWUP", "ARROWDOWN"];
const PLUS_MINUS_KEYS = ["MINUS", "EQUAL"];
const BRACKET_KEYS = ["BRACKETLEFT", "BRACKETRIGHT"];

function sameModifiers(a: string, b: string): boolean {
  return sortedModifiers(a).join() === sortedModifiers(b).join();
}

function keyOf(combo: string): string | null {
  const { key } = splitCombo(combo);
  return key === null ? null : canonicalKey(key);
}

function fallsIntoFamily(combo: string, family: HotkeyAction["kind"]): boolean {
  const key = keyOf(combo);
  if (key === null) return false;
  if (family === "modifier_arrows") return ARROW_KEYS.includes(key);
  if (family === "modifier_plus_minus") return PLUS_MINUS_KEYS.includes(key);
  if (family === "modifier_brackets") return BRACKET_KEYS.includes(key);
  if (family === "modifier_digits") return isQuickActionDigit(key);
  return false;
}

const TRANSIENT_SCOPES: readonly HotkeyAction["scope"][] = [
  "recording",
  "teleprompter",
  "streaming",
];

function scopesCoexist(a: HotkeyAction["scope"], b: HotkeyAction["scope"]): boolean {
  return !(TRANSIENT_SCOPES.includes(a) && TRANSIENT_SCOPES.includes(b) && a !== b);
}

function keySpacesOverlap(
  a: HotkeyAction,
  comboA: string,
  b: HotkeyAction,
  comboB: string,
): boolean {
  if (comboA.trim() === "" || comboB.trim() === "") return false;
  if (a.kind === "combo" && b.kind === "combo") {
    return sameModifiers(comboA, comboB) && keyOf(comboA) === keyOf(comboB);
  }
  if (a.kind !== "combo" && b.kind !== "combo") {
    return a.kind === b.kind && sameModifiers(comboA, comboB);
  }
  const [combo, comboKind, family] =
    a.kind === "combo" ? [comboA, comboB, b.kind] : [comboB, comboA, a.kind];
  return sameModifiers(combo, comboKind) && fallsIntoFamily(combo, family);
}

export function hotkeysConflict(
  aId: HotkeyActionId,
  comboA: string,
  bId: HotkeyActionId,
  comboB: string,
): boolean {
  if (aId === bId) return false;
  const a = hotkeyAction(aId);
  const b = hotkeyAction(bId);
  return scopesCoexist(a.scope, b.scope) && keySpacesOverlap(a, comboA, b, comboB);
}

export interface HotkeyAssignment {
  bindings: HotkeyBinding[];
  stolenFrom: HotkeyActionId[];
}

function withBinding(
  bindings: HotkeyBinding[],
  id: HotkeyActionId,
  combo: string,
): HotkeyBinding[] {
  const rest = bindings.filter((b) => b.action !== id);
  if (combo === defaultCombo(id)) return rest;
  return [...rest, { action: id, combo }];
}

export function assignHotkey(
  bindings: HotkeyBinding[],
  id: HotkeyActionId,
  combo: string,
): HotkeyAssignment {
  const stolenFrom = HOTKEY_ACTIONS.filter(
    (other) =>
      other.id !== id && hotkeysConflict(id, combo, other.id, effectiveCombo(bindings, other.id)),
  ).map((other) => other.id);

  let next = bindings;
  for (const victim of stolenFrom) {
    next = withBinding(next, victim, "");
  }
  return { bindings: withBinding(next, id, combo), stolenFrom };
}

export function resetHotkey(bindings: HotkeyBinding[], id: HotkeyActionId): HotkeyAssignment {
  return assignHotkey(bindings, id, defaultCombo(id));
}
