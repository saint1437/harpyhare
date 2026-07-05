use std::str::FromStr;
use tauri::AppHandle;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

const ESC_HOTKEY: &str = "Escape";

pub fn parse_hotkey(s: &str) -> Option<Shortcut> {
    Shortcut::from_str(s.trim()).ok()
}

fn unparseable_hotkey_error(hotkey: &str) -> String {
    format!("Не удалось разобрать хоткей: {hotkey:?}")
}

fn defer(app: &AppHandle, work: fn(&AppHandle)) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move { work(&app) });
}

pub fn register_ptt(app: &AppHandle, hotkey: &str) -> Result<(), String> {
    let shortcut = parse_hotkey(hotkey).ok_or_else(|| unparseable_hotkey_error(hotkey))?;
    app.global_shortcut()
        .on_shortcut(shortcut, |app, _shortcut, event| match event.state {
            ShortcutState::Pressed => defer(app, crate::on_ptt_pressed),
            ShortcutState::Released => defer(app, crate::on_ptt_released),
        })
        .map_err(|e| e.to_string())
}

pub fn unregister_ptt(app: &AppHandle, hotkey: &str) {
    if let Some(shortcut) = parse_hotkey(hotkey) {
        let _ = app.global_shortcut().unregister(shortcut);
    }
}

pub fn register_toggle(app: &AppHandle, hotkey: &str) -> Result<(), String> {
    let shortcut = parse_hotkey(hotkey).ok_or_else(|| unparseable_hotkey_error(hotkey))?;
    app.global_shortcut()
        .on_shortcut(shortcut, |app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                defer(app, crate::on_toggle_visibility);
            }
        })
        .map_err(|e| e.to_string())
}

pub fn unregister_toggle(app: &AppHandle, hotkey: &str) {
    if let Some(shortcut) = parse_hotkey(hotkey) {
        let _ = app.global_shortcut().unregister(shortcut);
    }
}

pub fn register_esc(app: &AppHandle) {
    if let Some(shortcut) = parse_hotkey(ESC_HOTKEY) {
        let _ = app
            .global_shortcut()
            .on_shortcut(shortcut, |app, _shortcut, event| {
                if event.state == ShortcutState::Pressed {
                    defer(app, crate::on_cancel);
                }
            });
    }
}

pub fn unregister_esc(app: &AppHandle) {
    if let Some(shortcut) = parse_hotkey(ESC_HOTKEY) {
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
        let s = parse_hotkey(ESC_HOTKEY).expect("Escape должна парситься");
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
