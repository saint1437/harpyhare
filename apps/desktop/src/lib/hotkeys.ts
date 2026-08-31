import { HOTKEY_ACTIONS, QUICK_ACTION_LIMIT } from "@/ipc/bindings";
import type { HotkeyBinding } from "@/ipc/types";
import { PLATFORM, type Platform } from "./platform";

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

const MODIFIER_LABELS: Record<Platform, Record<string, string>> = {
  macos: {
    Cmd: "⌘",
    Shift: "⇧",
    Alt: "⌥",
    Ctrl: "⌃",
  },
  windows: {
    Cmd: "Win",
    Shift: "Shift",
    Alt: "Alt",
    Ctrl: "Ctrl",
  },
};

const TOKEN_JOINER: Record<Platform, string> = {
  macos: "",
  windows: COMBO_SEPARATOR,
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

const HINT_SEPARATOR = " ";
const ARROWS_HINT = "←→↑↓";
const PLUS_MINUS_HINT = "+ −";
const DIGITS_HINT = `1…${QUICK_ACTION_LIMIT}`;

const KIND_HINTS: Partial<Record<HotkeyAction["kind"], string>> = {
  modifier_arrows: ARROWS_HINT,
  modifier_plus_minus: PLUS_MINUS_HINT,
  modifier_digits: DIGITS_HINT,
};

export function hotkeyAction(id: HotkeyActionId): HotkeyAction {
  return HOTKEY_ACTIONS.find((a) => a.id === id) ?? HOTKEY_ACTIONS[0];
}

export function defaultCombo(id: HotkeyActionId, platform: Platform = PLATFORM): string {
  return hotkeyAction(id).defaultCombo[platform];
}

export function effectiveCombo(
  bindings: HotkeyBinding[],
  id: HotkeyActionId,
  platform: Platform = PLATFORM,
): string {
  for (let i = bindings.length - 1; i >= 0; i--) {
    const bound = bindings[i];
    if (bound?.action === id) return bound.combo;
  }
  return defaultCombo(id, platform);
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

export function formatCombo(combo: string, platform: Platform = PLATFORM): string {
  const { modifiers, key } = splitCombo(combo);
  const labels = MODIFIER_LABELS[platform];
  const parts = modifiers.map((m) => labels[m] ?? m);
  if (key !== null) parts.push(formatKey(key));
  return parts.join(TOKEN_JOINER[platform]);
}

export function formatComboWithKey(
  combo: string,
  key: string,
  platform: Platform = PLATFORM,
): string {
  return formatCombo([combo, key].join(COMBO_SEPARATOR), platform);
}

export function comboLabel(
  action: HotkeyAction,
  combo: string,
  platform: Platform = PLATFORM,
): string {
  if (combo.trim() === "") return "";
  const formatted = formatCombo(combo, platform);
  const hint = KIND_HINTS[action.kind];
  return hint === undefined ? formatted : `${formatted}${HINT_SEPARATOR}${hint}`;
}

export interface HotkeyHint {
  combo: string;
  label: string;
}

export interface HotkeyGroup {
  title: string;
  hints: HotkeyHint[];
}

const PASTE_MODIFIER: Record<Platform, string> = {
  macos: "Cmd",
  windows: "Ctrl",
};
const SEND_KEY = "Enter";
const PASTE_KEY = "V";
const FIELD_HINTS_GROUP = hotkeyAction("send").group;

function fieldHints(platform: Platform): Record<string, HotkeyHint[]> {
  const paste = [PASTE_MODIFIER[platform], PASTE_KEY].join(COMBO_SEPARATOR);
  const newline = ["Shift", SEND_KEY].join(COMBO_SEPARATOR);
  return {
    [FIELD_HINTS_GROUP]: [
      { combo: formatCombo(SEND_KEY, platform), label: "отправить из поля ввода" },
      { combo: formatCombo(newline, platform), label: "перенос строки" },
      { combo: formatCombo(paste, platform), label: "вставить скриншот" },
    ],
  };
}

export function hotkeyGroups(
  bindings: HotkeyBinding[],
  platform: Platform = PLATFORM,
): HotkeyGroup[] {
  const groups: HotkeyGroup[] = [];
  for (const action of HOTKEY_ACTIONS) {
    const combo = comboLabel(action, effectiveCombo(bindings, action.id, platform), platform);
    if (combo === "") continue;
    const hint = { combo, label: action.label.toLowerCase() };
    const existing = groups.find((g) => g.title === action.group);
    if (existing) existing.hints.push(hint);
    else groups.push({ title: action.group, hints: [hint] });
  }
  const hints = fieldHints(platform);
  for (const group of groups) {
    group.hints.push(...(hints[group.title] ?? []));
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

const KEY_GLYPH_ICONS: Record<string, ComboIconName> = {
  "⏎": "enter",
  "↑": "up",
  "↓": "down",
  "←": "left",
  "→": "right",
};

const MACOS_GLYPH_ICONS: Record<string, ComboIconName> = {
  "⌘": "cmd",
  "⇧": "shift",
  "⌥": "option",
  "⌃": "ctrl",
  "+": "plus",
  "−": "minus",
};

const ICON_BY_CHAR: Record<Platform, Record<string, ComboIconName>> = {
  macos: { ...MACOS_GLYPH_ICONS, ...KEY_GLYPH_ICONS },
  windows: KEY_GLYPH_ICONS,
};

export function comboTokens(combo: string, platform: Platform = PLATFORM): ComboToken[] {
  const icons = ICON_BY_CHAR[platform];
  const tokens: ComboToken[] = [];
  let openText = false;
  for (const ch of combo) {
    if (ch === HINT_SEPARATOR) {
      openText = false;
      continue;
    }
    const icon = icons[ch];
    if (icon) {
      tokens.push({ type: "icon", icon });
      openText = false;
      continue;
    }
    const last = tokens[tokens.length - 1];
    if (openText && last?.type === "text") last.text += ch;
    else {
      tokens.push({ type: "text", text: ch });
      openText = true;
    }
  }
  return tokens;
}
