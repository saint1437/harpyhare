export interface HotkeyEvent {
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  code: string;
}

/** Основная (не-модификаторная) клавиша из event.code → токен парсера, иначе null. */
function mainKey(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3); // KeyR → R
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code; // F1..F24
  if (/^Digit[0-9]$/.test(code)) return code.slice(5); // Digit1 → 1
  return null;
}

/**
 * Сериализует keydown в строку формата `parse_hotkey` ("Cmd+Shift+R", "F9", "V").
 * Возвращает null, если основной клавиши нет (нажаты только модификаторы) или код не распознан.
 */
export function hotkeyFromEvent(e: HotkeyEvent): string | null {
  const key = mainKey(e.code);
  if (key === null) return null;
  const mods: string[] = [];
  if (e.metaKey) mods.push("Cmd");
  if (e.ctrlKey) mods.push("Ctrl");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");
  return [...mods, key].join("+");
}
