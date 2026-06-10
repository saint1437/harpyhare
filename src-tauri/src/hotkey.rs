//! Регистрация глобальных горячих клавиш через tauri-plugin-global-shortcut.
//!
//! PTT-клавиша (по умолчанию "V") держится зажатой: Pressed -> старт записи,
//! Released -> стоп + распознавание. Esc регистрируется только на время записи
//! и отменяет её.
//!
//! Единственная чистая функция здесь — [`parse_hotkey`]; она покрыта юнит-тестами.
//! Регистрация/обработчики — glue с Tauri, тестами не покрываются.

use std::str::FromStr;
use tauri::AppHandle;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

/// Парсит строку настройки ("V", "F9", "Cmd+R"...) в [`Shortcut`].
///
/// `global-hotkey` уже умеет одиночные буквы ("V" -> код `KeyV`), функциональные
/// клавиши ("F9") и комбинации с модификаторами, причём регистронезависимо
/// (токены приводятся к верхнему регистру внутри парсера). Поэтому достаточно
/// делегировать в `Shortcut::from_str`; никакой ручной нормализации не нужно.
/// Мусор и пустая строка дают `None`.
pub fn parse_hotkey(s: &str) -> Option<Shortcut> {
    Shortcut::from_str(s.trim()).ok()
}

/// Регистрирует PTT-клавишу: Pressed -> [`crate::on_ptt_pressed`],
/// Released -> [`crate::on_ptt_released`].
pub fn register_ptt(app: &AppHandle, hotkey: &str) -> Result<(), String> {
    let shortcut = parse_hotkey(hotkey)
        .ok_or_else(|| format!("Не удалось разобрать хоткей: {hotkey:?}"))?;
    app.global_shortcut()
        .on_shortcut(shortcut, |app, _shortcut, event| match event.state {
            ShortcutState::Pressed => crate::on_ptt_pressed(app),
            ShortcutState::Released => crate::on_ptt_released(app),
        })
        .map_err(|e| e.to_string())
}

/// Снимает регистрацию PTT-клавиши. Ошибки глотаем (например, если она и не была
/// зарегистрирована — это нормально при смене хоткея/suspend).
pub fn unregister_ptt(app: &AppHandle, hotkey: &str) {
    if let Some(shortcut) = parse_hotkey(hotkey) {
        let _ = app.global_shortcut().unregister(shortcut);
    }
}

/// Регистрирует Escape на время записи: Pressed -> [`crate::on_cancel`].
pub fn register_esc(app: &AppHandle) {
    if let Some(shortcut) = parse_hotkey("Escape") {
        let _ = app
            .global_shortcut()
            .on_shortcut(shortcut, |app, _shortcut, event| {
                if event.state == ShortcutState::Pressed {
                    crate::on_cancel(app);
                }
            });
    }
}

/// Снимает регистрацию Escape. Ошибки глотаем.
pub fn unregister_esc(app: &AppHandle) {
    if let Some(shortcut) = parse_hotkey("Escape") {
        let _ = app.global_shortcut().unregister(shortcut);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri_plugin_global_shortcut::{Code, Modifiers};

    #[test]
    fn single_letter_v_becomes_keyv() {
        let s = parse_hotkey("V").expect("V должна парситься");
        assert_eq!(s.key, Code::KeyV);
        assert_eq!(s.mods, Modifiers::empty());
    }

    #[test]
    fn parsing_is_case_insensitive() {
        // строчная "v" и заглавная "V" дают один и тот же код клавиши
        let upper = parse_hotkey("V").unwrap();
        let lower = parse_hotkey("v").unwrap();
        assert_eq!(upper.key, Code::KeyV);
        assert_eq!(lower.key, Code::KeyV);
    }

    #[test]
    fn function_key_f9_parses() {
        let s = parse_hotkey("F9").expect("F9 должна парситься");
        assert_eq!(s.key, Code::F9);
        assert_eq!(s.mods, Modifiers::empty());
    }

    #[test]
    fn modifier_combo_parses() {
        let s = parse_hotkey("Cmd+R").expect("Cmd+R должна парситься");
        assert_eq!(s.key, Code::KeyR);
        assert!(s.mods.contains(Modifiers::SUPER));
    }

    #[test]
    fn escape_parses_for_cancel() {
        let s = parse_hotkey("Escape").expect("Escape должна парситься");
        assert_eq!(s.key, Code::Escape);
    }

    #[test]
    fn garbage_returns_none() {
        assert!(parse_hotkey("notakey").is_none());
        assert!(parse_hotkey("").is_none());
        assert!(parse_hotkey("   ").is_none());
        assert!(parse_hotkey("Ctrl+").is_none());
    }
}
