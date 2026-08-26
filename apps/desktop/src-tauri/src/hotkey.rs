use std::str::FromStr;
use tauri::AppHandle;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use crate::{hotkeys, recording, screenshot, window};

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
            ShortcutState::Pressed => defer(app, recording::on_ptt_pressed),
            ShortcutState::Released => defer(app, recording::on_ptt_released),
        })
        .map_err(|e| e.to_string())
}

/// Every global action except PTT (which also handles Released) registers the
/// same way: parse → on_shortcut → Pressed → defer. The body lives once — six
/// drifting copies had already piled up, and every new key used to add two.
fn register_on_press(app: &AppHandle, hotkey: &str, work: fn(&AppHandle)) -> Result<(), String> {
    let shortcut = parse_hotkey(hotkey).ok_or_else(|| unparseable_hotkey_error(hotkey))?;
    app.global_shortcut()
        .on_shortcut(shortcut, move |app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                defer(app, work);
            }
        })
        .map_err(|e| e.to_string())
}

pub fn unregister_hotkey(app: &AppHandle, hotkey: &str) {
    if let Some(shortcut) = parse_hotkey(hotkey) {
        let _ = app.global_shortcut().unregister(shortcut);
    }
}

pub fn register_toggle(app: &AppHandle, hotkey: &str) -> Result<(), String> {
    register_on_press(app, hotkey, window::on_toggle_visibility)
}

pub fn register_teleprompter(app: &AppHandle, hotkey: &str) -> Result<(), String> {
    register_on_press(app, hotkey, window::on_toggle_teleprompter)
}

pub fn register_auto_mode(app: &AppHandle, hotkey: &str) -> Result<(), String> {
    register_on_press(app, hotkey, crate::auto::on_toggle)
}

pub fn register_auto_answer(app: &AppHandle, hotkey: &str) -> Result<(), String> {
    register_on_press(app, hotkey, crate::events::auto_answer)
}

pub fn register_screenshot(app: &AppHandle, hotkey: &str) -> Result<(), String> {
    register_on_press(app, hotkey, screenshot::on_capture_region)
}

pub fn register_focus_prompt(app: &AppHandle, hotkey: &str) -> Result<(), String> {
    register_on_press(app, hotkey, window::show_and_focus_prompt)
}

/// Отмена регистрируется глобально на время записи, но именно ГЛОБАЛЬНО она
/// может и не встать: у сочетания без модификаторов шансов меньше всего, а ОС
/// вправе отказать без объяснений. Раньше отказ глушился через `let _` — и
/// Escape просто молча ничего не делал, ровно как забытое действие в
/// `GLOBAL_HOTKEYS`. Теперь отказ хотя бы виден в stderr, а окно всё равно
/// слушает то же сочетание своим обработчиком.
pub fn register_cancel(app: &AppHandle, hotkey: &str) {
    if let Err(e) = register_on_press(app, hotkey, recording::on_cancel) {
        eprintln!("[hotkey] отмена {hotkey} не зарегистрирована глобально: {e}");
    }
}

pub fn cancel_combo(app: &AppHandle) -> String {
    hotkeys::effective(
        &crate::app_state::current_settings(app).hotkeys,
        hotkeys::ACTION_CANCEL_RECORDING,
    )
}

#[cfg(test)]
mod tests;
