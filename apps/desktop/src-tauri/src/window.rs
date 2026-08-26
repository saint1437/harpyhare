use std::time::Duration;

use tauri::{AppHandle, Manager, WebviewWindow};

use crate::app_state::{current_settings, App};
use crate::error::{internal, AppError};
use crate::window_service::{CollapseLayout, Monitor, WindowFrame, WindowSurface};
use crate::window_tween;
use crate::{events, hotkey, hotkeys, platform, settings};

pub const MAIN_WINDOW_LABEL: &str = "main";
pub const LAUNCHER_WINDOW_LABEL: &str = "launcher";

const MAIN_WINDOW_URL: &str = "index.html";
const LAUNCHER_WINDOW_URL: &str = "launcher.html";
const LAUNCHER_WINDOW_WIDTH_LOGICAL_PX: f64 = 1000.0;
const LAUNCHER_WINDOW_HEIGHT_LOGICAL_PX: f64 = 720.0;
const LAUNCHER_WINDOW_MIN_WIDTH_LOGICAL_PX: f64 = 520.0;
const LAUNCHER_WINDOW_MIN_HEIGHT_LOGICAL_PX: f64 = 480.0;

const SCREEN_CAPTURE_HIDE_SETTLE: Duration = Duration::from_millis(120);

/// Окно клубка. Больше самого кружка: круг рисуется в CSS с прозрачным полем,
/// поэтому нативное скругление углов (22px на macOS, системное на Windows)
/// до него не дотягивается и трогать его не нужно. Поле нужно ещё и тени
/// кружка — ей есть куда лечь, не упираясь в край окна.
const COLLAPSED_SIZE_LOGICAL_PX: f64 = 80.0;

pub fn main_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(MAIN_WINDOW_LABEL)
}

pub fn launcher_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(LAUNCHER_WINDOW_LABEL)
}

fn window_title(app: &AppHandle) -> String {
    app.package_info().name.clone()
}

fn apply_content_protection(w: &WebviewWindow, settings: &settings::Settings) {
    let _ = w.set_content_protected(!settings.screen_share_visible);
}

pub fn apply_content_protection_all(app: &AppHandle, settings: &settings::Settings) {
    for (_, w) in app.webview_windows() {
        apply_content_protection(&w, settings);
    }
}

pub fn create_launcher_window(app: &AppHandle, settings: &settings::Settings) -> Result<(), AppError> {
    if launcher_window(app).is_some() {
        return Ok(());
    }
    tauri::WebviewWindowBuilder::new(
        app,
        LAUNCHER_WINDOW_LABEL,
        tauri::WebviewUrl::App(LAUNCHER_WINDOW_URL.into()),
    )
    .title(window_title(app))
    .inner_size(
        LAUNCHER_WINDOW_WIDTH_LOGICAL_PX,
        LAUNCHER_WINDOW_HEIGHT_LOGICAL_PX,
    )
    .min_inner_size(
        LAUNCHER_WINDOW_MIN_WIDTH_LOGICAL_PX,
        LAUNCHER_WINDOW_MIN_HEIGHT_LOGICAL_PX,
    )
    .resizable(true)
    .center()
    .shadow(false)
    // No .theme(): on macOS tao turns that into an app-wide `[NSApp setAppearance:]`
    // that is never reset, so both `Window::theme()` and the webview's
    // `prefers-color-scheme` would report a value the user never chose.
    .content_protected(!settings.screen_share_visible)
    .build()
    .map_err(|e| internal(e.to_string()))?;
    platform::merge_titlebar_into_content(app);
    Ok(())
}

fn create_main_window(app: &AppHandle, settings: &settings::Settings) -> Result<(), AppError> {
    if main_window(app).is_some() {
        return Ok(());
    }
    tauri::WebviewWindowBuilder::new(
        app,
        MAIN_WINDOW_LABEL,
        tauri::WebviewUrl::App(MAIN_WINDOW_URL.into()),
    )
    .title(window_title(app))
    .inner_size(settings.window_width, settings.window_height)
    .min_inner_size(
        settings::limits::window::WIDTH.min,
        settings::limits::window::HEIGHT.min,
    )
    .transparent(true)
    .decorations(false)
    // Нативная тень рисуется по границам ОКНА, а не по тому, что внутри. В
    // прозрачном безрамочном окне это тёмный прямоугольный ореол вокруг
    // содержимого; глубину даёт CSS, где она следует настоящей форме.
    .shadow(false)
    .always_on_top(true)
    .visible_on_all_workspaces(true)
    .content_protected(!settings.screen_share_visible)
    .center()
    .build()
    .map_err(|e| internal(e.to_string()))?;
    platform::clip_native_window_corners(app);
    Ok(())
}

type GlobalRegistrar = fn(&AppHandle, &str) -> Result<(), String>;
type GlobalUnregistrar = fn(&AppHandle, &str);

const GLOBAL_HOTKEYS: &[(&str, GlobalRegistrar, GlobalUnregistrar)] = &[
    (hotkeys::ACTION_RECORD, hotkey::register_ptt, hotkey::unregister_hotkey),
    (hotkeys::ACTION_TOGGLE_WINDOW, hotkey::register_toggle, hotkey::unregister_hotkey),
    (hotkeys::ACTION_TELEPROMPTER, hotkey::register_teleprompter, hotkey::unregister_hotkey),
    (hotkeys::ACTION_AUTO_MODE, hotkey::register_auto_mode, hotkey::unregister_hotkey),
    (hotkeys::ACTION_AUTO_ANSWER, hotkey::register_auto_answer, hotkey::unregister_hotkey),
    (hotkeys::ACTION_SCREENSHOT, hotkey::register_screenshot, hotkey::unregister_hotkey),
    (hotkeys::ACTION_FOCUS_PROMPT, hotkey::register_focus_prompt, hotkey::unregister_hotkey),
];

pub fn register_main_window_hotkeys(app: &AppHandle, s: &settings::Settings) {
    for (action, register, _) in GLOBAL_HOTKEYS {
        let combo = hotkeys::effective(&s.hotkeys, action);
        if combo.is_empty() {
            continue;
        }
        if let Err(e) = register(app, &combo) {
            eprintln!("не удалось зарегистрировать хоткей {action} ({combo:?}): {e}");
        }
    }
}

pub fn unregister_main_window_hotkeys_for(app: &AppHandle, s: &settings::Settings) {
    for (action, _, unregister) in GLOBAL_HOTKEYS {
        let combo = hotkeys::effective(&s.hotkeys, action);
        if !combo.is_empty() {
            unregister(app, &combo);
        }
    }
    hotkey::unregister_hotkey(app, &hotkeys::effective(&s.hotkeys, hotkeys::ACTION_CANCEL_RECORDING));
}

pub fn show_and_focus_prompt(app: &AppHandle) {
    if let Some(w) = main_window(app) {
        let _ = w.show();
        let _ = w.set_focus();
        events::focus_prompt(app);
    }
}

fn hide_main(app: &AppHandle) -> Result<(), AppError> {
    if let Some(w) = main_window(app) {
        let _ = w.hide();
    }
    Ok(())
}

/// Хоткей больше не прячет окно, а сворачивает его в клубок: спрятанное окно
/// не отвечало на вопрос «меня сейчас слышно?», а именно в этом сценарии —
/// когда сфокусировано чужое приложение — push-to-talk и задуман работать.
pub fn on_toggle_visibility(app: &AppHandle) {
    let collapsed = app.state::<App>().window.is_collapsed();
    set_collapsed(app, !collapsed, true);
}

/// The real window behind `WindowSurface`. `resize_to` goes through
/// `set_window_size` rather than `set_size` on purpose: the tween, the epsilon
/// and the monitor anchoring all live there.
struct TauriWindowSurface {
    app: AppHandle,
    window: WebviewWindow,
}

impl WindowSurface for TauriWindowSurface {
    fn set_min_size(&self, width: f64, height: f64) {
        let _ = self
            .window
            .set_min_size(Some(tauri::LogicalSize::new(width, height)));
    }

    fn resize_to(&self, width: f64, height: f64) {
        set_window_size(self.app.clone(), width, height);
    }

    fn show_and_focus(&self, focus: bool) {
        let _ = self.window.show();
        if focus {
            let _ = self.window.set_focus();
        }
    }

    fn restore_min_size_after_tween(&self, width: f64, height: f64, generation: u64) {
        window_tween::restore_min_size_after_tween(
            self.app.clone(),
            self.window.clone(),
            width,
            height,
            generation,
        );
    }
}

fn collapse_layout(settings: &settings::Settings) -> CollapseLayout {
    CollapseLayout {
        orb: COLLAPSED_SIZE_LOGICAL_PX,
        expanded_width: settings.window_width,
        expanded_height: settings.window_height,
        min_width: settings::limits::window::WIDTH.min,
        min_height: settings::limits::window::HEIGHT.min,
    }
}

pub fn set_collapsed(app: &AppHandle, collapsed: bool, focus: bool) {
    let Some(window) = main_window(app) else {
        return;
    };
    let layout = collapse_layout(&current_settings(app));
    let surface = TauriWindowSurface {
        app: app.clone(),
        window,
    };
    app.state::<App>()
        .window
        .set_collapsed(app, &surface, collapsed, focus, layout);
}

#[tauri::command]
#[specta::specta]
pub fn set_window_collapsed(app: AppHandle, collapsed: bool, focus: bool) {
    set_collapsed(&app, collapsed, focus);
}

pub async fn hide_for_screen_capture(app: &AppHandle) -> bool {
    let Some(w) = main_window(app) else {
        return false;
    };
    if !w.is_visible().unwrap_or(false) {
        return false;
    }
    if on_main_thread(app, hide_main).await.is_err() {
        return false;
    }
    tokio::time::sleep(SCREEN_CAPTURE_HIDE_SETTLE).await;
    true
}

pub fn on_toggle_teleprompter(app: &AppHandle) {
    events::toggle_teleprompter(app);
}

async fn on_main_thread<F>(app: &AppHandle, work: F) -> Result<(), AppError>
where
    F: FnOnce(&AppHandle) -> Result<(), AppError> + Send + 'static,
{
    let (done, wait) = tokio::sync::oneshot::channel();
    let handle = app.clone();
    app.run_on_main_thread(move || {
        let _ = done.send(work(&handle));
    })
    .map_err(|e| internal(e.to_string()))?;
    wait.await.map_err(|e| internal(e.to_string()))?
}

fn swap_to_main_window(app: &AppHandle) -> Result<(), AppError> {
    let settings = current_settings(app);
    create_main_window(app, &settings)?;
    register_main_window_hotkeys(app, &settings);
    if let Some(w) = launcher_window(app) {
        let _ = w.destroy();
    }
    let capture_app = app.clone();
    let start_auto = settings.auto_mode_enabled;
    tauri::async_runtime::spawn_blocking(move || {
        crate::recording::ensure_capture(&capture_app);
        if start_auto {
            if let Err(e) = crate::auto::start(&capture_app) {
                // A fast failure lands before the webview subscribes to
                // auto-mode-error — the HUD pulls the record via a command on
                // mount.
                crate::auto::record_start_error(&capture_app, &e);
                events::auto_mode_error(&capture_app, e);
            }
        }
    });
    Ok(())
}

fn swap_to_launcher_window(app: &AppHandle) -> Result<(), AppError> {
    // Off the main thread: stop() waits for auto mode's transition lock, and a
    // slow mic open (up to 5 s on Windows) may be running under it.
    let stop_app = app.clone();
    tauri::async_runtime::spawn_blocking(move || crate::auto::stop(&stop_app));
    let settings = current_settings(app);
    unregister_main_window_hotkeys_for(app, &settings);
    create_launcher_window(app, &settings)?;
    if let Some(w) = main_window(app) {
        let _ = w.destroy();
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn launch_main_window(app: AppHandle) -> Result<(), AppError> {
    on_main_thread(&app, swap_to_main_window).await
}

#[tauri::command]
#[specta::specta]
pub async fn stop_main_window(app: AppHandle) -> Result<(), AppError> {
    on_main_thread(&app, swap_to_launcher_window).await
}

#[tauri::command]
#[specta::specta]
pub fn close_app(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
#[specta::specta]
pub fn set_window_size(app: AppHandle, width: f64, height: f64) {
    let Some(w) = main_window(&app) else {
        return;
    };
    let planned = app
        .state::<App>()
        .window
        .plan_resize(current_frame(&w, width, height), width, height, monitor_of(&w));
    let Some((tween, generation)) = planned else {
        return;
    };
    window_tween::start_resize(app.clone(), w, tween, generation);
}

/// The fallbacks are the requested size on purpose: a window that cannot report
/// its own frame must not animate from zero.
fn current_frame(w: &WebviewWindow, width: f64, height: f64) -> WindowFrame {
    let scale = w.scale_factor().unwrap_or(1.0);
    let size = w.inner_size().ok();
    let position = w.outer_position().unwrap_or(tauri::PhysicalPosition::new(0, 0));
    WindowFrame {
        width: size.map(|s| s.width as f64 / scale).unwrap_or(width),
        height: size.map(|s| s.height as f64 / scale).unwrap_or(height),
        x: position.x,
        y: position.y,
        scale,
    }
}

fn monitor_of(w: &WebviewWindow) -> Option<Monitor> {
    w.current_monitor().ok().flatten().map(|m| Monitor {
        x: m.position().x,
        width: m.size().width,
    })
}

#[cfg(test)]
mod tests;
