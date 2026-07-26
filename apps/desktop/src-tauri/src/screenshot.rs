use base64::Engine;
use tauri::AppHandle;

use crate::error::{AppError, ErrorCode};
use crate::{events, platform, window};

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;

#[cfg(target_os = "macos")]
use macos as backend;
#[cfg(target_os = "windows")]
use windows as backend;

pub const SCREENSHOT_MEDIA_TYPE: &str = "image/png";

const LOG_TAG: &str = "[screenshot]";
const NO_PERMISSION_MESSAGE: &str =
    "Нет разрешения «Запись экрана». Выдай его в системных настройках и повтори.";

fn deliver(app: &AppHandle, png: Vec<u8>) {
    let data_base64 = base64::engine::general_purpose::STANDARD.encode(&png);
    events::screenshot_ready(
        app,
        events::ScreenshotReady {
            media_type: SCREENSHOT_MEDIA_TYPE.to_string(),
            data_base64,
        },
    );
    window::show_and_focus_main(app);
}

pub fn on_capture_region(app: &AppHandle) {
    if !platform::screen_capture_access() {
        events::screenshot_error(
            app,
            AppError {
                code: ErrorCode::Permission,
                message: NO_PERMISSION_MESSAGE.to_string(),
            },
        );
        return;
    }
    let app = app.clone();
    let _ = app.clone().run_on_main_thread(move || match backend::capture_region() {
        Ok(Some(png)) => deliver(&app, png),
        Ok(None) => {}
        Err(message) => {
            eprintln!("{LOG_TAG} {message}");
            events::screenshot_error(
                &app,
                AppError {
                    code: ErrorCode::Internal,
                    message,
                },
            );
        }
    });
}

#[tauri::command]
#[specta::specta]
pub fn capture_region_screenshot(app: AppHandle) {
    on_capture_region(&app);
}
