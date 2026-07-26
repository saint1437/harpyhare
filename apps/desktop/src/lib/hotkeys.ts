import { HOTKEY_ACTIONS } from "@/ipc/bindings";
import type { HotkeyBinding } from "@/ipc/types";

export type HotkeyAction = (typeof HOTKEY_ACTIONS)[number];
export type HotkeyActionId = HotkeyAction["id"];

const COMBO_SEPARATOR = "+";

const MODIFIER_ALIASES: Record<string, string> = {
  cmd: "Cmd",
  command: "Cmd",
  super: "Cmd",
  meta: "Cmd",
  ctrl: "Ctrl",
  control: "Ctrl",
  alt: "Alt",
  option: "Alt",
  shift: "Shift",
};

const MODIFIER_SYMBOLS: Record<string, string> = {
  Cmd: "⌘",
  Shift: "⇧",
  Alt: "⌥",
  Ctrl: "⌃",
};

const KEY_SYMBOLS: Record<string, string> = {
  ENTER: "⏎",
  ESCAPE: "Esc",
  SPACE: "␣",
  TAB: "⇥",
  BACKSPACE: "⌫",
  DELETE: "⌦",
  ARROWUP: "↑",
  ARROWDOWN: "↓",
  ARROWLEFT: "←",
  ARROWRIGHT: "→",
  MINUS: "−",
  EQUAL: "+",
  COMMA: ",",
  PERIOD: ".",
  SLASH: "/",
  BACKSLASH: "\\",
  SEMICOLON: ";",
  QUOTE: "'",
  BACKQUOTE: "`",
  BRACKETLEFT: "[",
  BRACKETRIGHT: "]",
  PAGEUP: "PgUp",
  PAGEDOWN: "PgDn",
};

const ARROWS_HINT = "←→↑↓";
const PLUS_MINUS_HINT = "+ −";

export function hotkeyAction(id: HotkeyActionId): HotkeyAction {
  return HOTKEY_ACTIONS.find((a) => a.id === id) ?? HOTKEY_ACTIONS[0];
}

export function effectiveCombo(bindings: HotkeyBinding[], id: HotkeyActionId): string {
  const bound = [...bindings].reverse().find((b) => b.action === id);
  return bound ? bound.combo : hotkeyAction(id).defaultCombo;
}

export function splitCombo(combo: string): { modifiers: string[]; key: string | null } {
  const modifiers: string[] = [];
  let key: string | null = null;
  for (const raw of combo.split(COMBO_SEPARATOR)) {
    const token = raw.trim();
    if (token === "") continue;
    const canonical = MODIFIER_ALIASES[token.toLowerCase()];
    if (canonical === undefined) key = token;
    else if (!modifiers.includes(canonical)) modifiers.push(canonical);
  }
  return { modifiers, key };
}

export function sortedModifiers(combo: string): string[] {
  return [...splitCombo(combo).modifiers].sort();
}

export function canonicalKey(token: string): string {
  const upper = token.trim().toUpperCase();
  for (const prefix of ["KEY", "DIGIT"]) {
    if (upper.startsWith(prefix) && upper.length === prefix.length + 1) {
      return upper.slice(prefix.length);
    }
  }
  return upper;
}

function formatKey(token: string): string {
  const canonical = canonicalKey(token);
  return KEY_SYMBOLS[canonical] ?? canonical;
}

export function formatCombo(combo: string): string {
  const { modifiers, key } = splitCombo(combo);
  const parts = modifiers.map((m) => MODIFIER_SYMBOLS[m] ?? m);
  if (key !== null) parts.push(formatKey(key));
  return parts.join("");
}

export function comboLabel(action: HotkeyAction, combo: string): string {
  if (combo.trim() === "") return "";
  if (action.kind === "modifier_arrows") return `${formatCombo(combo)} ${ARROWS_HINT}`;
  if (action.kind === "modifier_plus_minus") return `${formatCombo(combo)} ${PLUS_MINUS_HINT}`;
  return formatCombo(combo);
}

export interface HotkeyHint {
  combo: string;
  label: string;
}

export interface HotkeyGroup {
  title: string;
  hints: HotkeyHint[];
}

const FIELD_HINTS: Record<string, HotkeyHint[]> = {
  Отправка: [
    { combo: "⏎", label: "отправить из поля ввода" },
    { combo: "⇧⏎", label: "перенос строки" },
    { combo: "⌘V", label: "вставить скриншот" },
  ],
};

export function hotkeyGroups(bindings: HotkeyBinding[]): HotkeyGroup[] {
  const groups: HotkeyGroup[] = [];
  for (const action of HOTKEY_ACTIONS) {
    const combo = comboLabel(action, effectiveCombo(bindings, action.id));
    if (combo === "") continue;
    const hint = { combo, label: action.label.toLowerCase() };
    const existing = groups.find((g) => g.title === action.group);
    if (existing) existing.hints.push(hint);
    else groups.push({ title: action.group, hints: [hint] });
  }
  for (const group of groups) {
    group.hints.push(...(FIELD_HINTS[group.title] ?? []));
  }
  return groups;
}

export type ComboIconName =
  | "cmd"
  | "shift"
  | "option"
  | "ctrl"
  | "enter"
  | "up"
  | "down"
  | "left"
  | "right"
  | "plus"
  | "minus";

export type ComboToken = { type: "icon"; icon: ComboIconName } | { type: "text"; text: string };

const ICON_BY_CHAR: Record<string, ComboIconName> = {
  "⌘": "cmd",
  "⇧": "shift",
  "⌥": "option",
  "⌃": "ctrl",
  "⏎": "enter",
  "↑": "up",
  "↓": "down",
  "←": "left",
  "→": "right",
  "+": "plus",
  "−": "minus",
};

export function comboTokens(combo: string): ComboToken[] {
  const tokens: ComboToken[] = [];
  for (const ch of combo) {
    const icon = ICON_BY_CHAR[ch];
    if (icon) {
      tokens.push({ type: "icon", icon });
      continue;
    }
    if (ch === " ") continue;
    const last = tokens[tokens.length - 1];
    if (last?.type === "text") last.text += ch;
    else tokens.push({ type: "text", text: ch });
  }
  return tokens;
}
