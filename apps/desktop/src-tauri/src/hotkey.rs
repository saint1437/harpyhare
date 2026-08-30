use std::str::FromStr;
use tauri::AppHandle;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use crate::{hotkeys, platform, recording, screenshot, window};

const ARROW_KEYS: &[(&str, i32, i32)] = &[
    ("ArrowLeft", -1, 0),
    ("ArrowRight", 1, 0),
    ("ArrowUp", 0, -1),
    ("ArrowDown", 0, 1),
];

fn arrow_shortcut(modifier: &str, key: &str) -> Option<Shortcut> {
    parse_hotkey(&format!("{modifier}{}{key}", hotkeys::COMBO_SEPARATOR))
}

pub fn register_arrow_family(app: &AppHandle, modifier: &str) -> Result<(), String> {
    let mask = platform::modifier_mask(modifier);
    for (key, dx, dy) in ARROW_KEYS {
        let Some(shortcut) = arrow_shortcut(modifier, key) else {
            unregister_arrow_family(app, modifier);
            return Err(unparseable_hotkey_error(modifier));
        };
        let (dx, dy) = (*dx, *dy);
        let registered = app
            .global_shortcut()
            .on_shortcut(shortcut, move |app, _shortcut, event| {
                if event.state == ShortcutState::Pressed {
                    let app = app.clone();
                    tauri::async_runtime::spawn(async move {
                        window::focus_main_window_if_unfocused(&app);
                        platform::handle_arrow_key(&app, mask, dx, dy);
                    });
                }
            });
        if let Err(e) = registered {
            unregister_arrow_family(app, modifier);
            return Err(e.to_string());
        }
    }
    Ok(())
}

pub fn unregister_arrow_family(app: &AppHandle, modifier: &str) {
    for (key, _, _) in ARROW_KEYS {
        if let Some(shortcut) = arrow_shortcut(modifier, key) {
            let _ = app.global_shortcut().unregister(shortcut);
        }
    }
}

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
                defer(app, window::on_toggle_mini);
            }
        })
        .map_err(|e| e.to_string())
}

pub fn unregister_toggle(app: &AppHandle, hotkey: &str) {
    if let Some(shortcut) = parse_hotkey(hotkey) {
        let _ = app.global_shortcut().unregister(shortcut);
    }
}

pub fn register_teleprompter(app: &AppHandle, hotkey: &str) -> Result<(), String> {
    let shortcut = parse_hotkey(hotkey).ok_or_else(|| unparseable_hotkey_error(hotkey))?;
    app.global_shortcut()
        .on_shortcut(shortcut, |app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                defer(app, window::on_toggle_teleprompter);
            }
        })
        .map_err(|e| e.to_string())
}

pub fn unregister_teleprompter(app: &AppHandle, hotkey: &str) {
    if let Some(shortcut) = parse_hotkey(hotkey) {
        let _ = app.global_shortcut().unregister(shortcut);
    }
}

pub fn register_screenshot(app: &AppHandle, hotkey: &str) -> Result<(), String> {
    let shortcut = parse_hotkey(hotkey).ok_or_else(|| unparseable_hotkey_error(hotkey))?;
    app.global_shortcut()
        .on_shortcut(shortcut, |app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                defer(app, screenshot::on_capture_region);
            }
        })
        .map_err(|e| e.to_string())
}

pub fn unregister_screenshot(app: &AppHandle, hotkey: &str) {
    if let Some(shortcut) = parse_hotkey(hotkey) {
        let _ = app.global_shortcut().unregister(shortcut);
    }
}

pub fn register_focus_prompt(app: &AppHandle, hotkey: &str) -> Result<(), String> {
    let shortcut = parse_hotkey(hotkey).ok_or_else(|| unparseable_hotkey_error(hotkey))?;
    app.global_shortcut()
        .on_shortcut(shortcut, |app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                defer(app, window::show_and_focus_prompt);
            }
        })
        .map_err(|e| e.to_string())
}

pub fn unregister_focus_prompt(app: &AppHandle, hotkey: &str) {
    if let Some(shortcut) = parse_hotkey(hotkey) {
        let _ = app.global_shortcut().unregister(shortcut);
    }
}

pub fn register_cancel(app: &AppHandle, hotkey: &str) {
    if let Some(shortcut) = parse_hotkey(hotkey) {
        let _ = app
            .global_shortcut()
            .on_shortcut(shortcut, |app, _shortcut, event| {
                if event.state == ShortcutState::Pressed {
                    defer(app, recording::on_cancel);
                }
            });
    }
}

pub fn unregister_cancel(app: &AppHandle, hotkey: &str) {
    if let Some(shortcut) = parse_hotkey(hotkey) {
        let _ = app.global_shortcut().unregister(shortcut);
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
