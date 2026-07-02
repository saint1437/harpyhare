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
 * Хоткей «мешает печати»: одиночная буква/цифра (в т.ч. с Shift) — нажатие такой
 * клавиши в текстовом поле означает ввод символа, PTT на неё надо глушить при
 * фокусе в полях. F-клавиши и комбинации с Cmd/Ctrl/Alt печати не мешают.
 */
export function conflictsWithTyping(hotkey: string): boolean {
  const parts = hotkey
    .split("+")
    .map((p) => p.trim())
    .filter((p) => p !== "");
  const key = parts[parts.length - 1] ?? "";
  const mods = parts.slice(0, -1).map((m) => m.toLowerCase());
  if (
    mods.some((m) =>
      ["cmd", "command", "meta", "super", "ctrl", "control", "alt", "option"].includes(m),
    )
  ) {
    return false;
  }
  return /^[a-z0-9]$/i.test(key);
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
