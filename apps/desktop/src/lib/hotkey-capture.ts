export interface HotkeyEvent {
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  code: string;
}

const HOTKEY_SEPARATOR = "+";
const LETTER_CODE_RE = /^Key([A-Z])$/;
const FUNCTION_KEY_CODE_RE = /^F(?:[1-9]|1[0-9]|2[0-4])$/;
const DIGIT_CODE_RE = /^Digit([0-9])$/;
const NUMPAD_CODE_RE = /^Numpad(?:[0-9]|Add|Subtract|Multiply|Divide|Decimal|Enter)$/;
const SINGLE_LETTER_OR_DIGIT_RE = /^[a-z0-9]$/i;
const TYPING_SAFE_MODIFIERS = new Set([
  "cmd",
  "command",
  "meta",
  "super",
  "ctrl",
  "control",
  "alt",
  "option",
]);

const NAMED_CODES = new Set([
  "Escape",
  "Enter",
  "Space",
  "Tab",
  "Backspace",
  "Delete",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "Insert",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Minus",
  "Equal",
  "BracketLeft",
  "BracketRight",
  "Backslash",
  "Semicolon",
  "Quote",
  "Backquote",
  "Comma",
  "Period",
  "Slash",
]);

const MODIFIER_ONLY_CODES = new Set([
  "MetaLeft",
  "MetaRight",
  "ShiftLeft",
  "ShiftRight",
  "AltLeft",
  "AltRight",
  "ControlLeft",
  "ControlRight",
  "CapsLock",
]);

export function isModifierOnlyCode(code: string): boolean {
  return MODIFIER_ONLY_CODES.has(code);
}

function mainKeyToken(code: string): string | null {
  const letter = LETTER_CODE_RE.exec(code)?.[1];
  if (letter !== undefined) return letter;
  if (FUNCTION_KEY_CODE_RE.test(code)) return code;
  const digit = DIGIT_CODE_RE.exec(code)?.[1];
  if (digit !== undefined) return digit;
  if (NAMED_CODES.has(code) || NUMPAD_CODE_RE.test(code)) return code;
  return null;
}

export function conflictsWithTyping(hotkey: string): boolean {
  const parts = hotkey
    .split(HOTKEY_SEPARATOR)
    .map((p) => p.trim())
    .filter((p) => p !== "");
  const key = parts[parts.length - 1] ?? "";
  const mods = parts.slice(0, -1).map((m) => m.toLowerCase());
  if (mods.some((m) => TYPING_SAFE_MODIFIERS.has(m))) return false;
  return SINGLE_LETTER_OR_DIGIT_RE.test(key);
}

export function hotkeyFromEvent(e: HotkeyEvent): string | null {
  const key = mainKeyToken(e.code);
  if (key === null) return null;
  const mods: string[] = [];
  if (e.metaKey) mods.push("Cmd");
  if (e.ctrlKey) mods.push("Ctrl");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");
  return [...mods, key].join(HOTKEY_SEPARATOR);
}
