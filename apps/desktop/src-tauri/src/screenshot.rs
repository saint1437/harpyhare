use std::sync::atomic::Ordering;

use base64::Engine;
use tauri::{AppHandle, Manager};

use crate::app_state::App;
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
    if crate::app_state::current_settings(app).copy_results_to_clipboard {
        crate::clipboard::write_png(app, &png);
    }
    let data_base64 = base64::engine::general_purpose::STANDARD.encode(&png);
    events::screenshot_ready(
        app,
        events::ScreenshotReady {
            media_type: SCREENSHOT_MEDIA_TYPE.to_string(),
            data_base64,
        },
    );
}

struct CaptureSlot(AppHandle);

impl CaptureSlot {
    fn claim(app: &AppHandle) -> Option<Self> {
        let busy = app.state::<App>().screenshot_capturing.swap(true, Ordering::SeqCst);
        (!busy).then(|| Self(app.clone()))
    }
}

impl Drop for CaptureSlot {
    fn drop(&mut self) {
        self.0.state::<App>().screenshot_capturing.store(false, Ordering::SeqCst);
    }
}

fn report_failure(app: &AppHandle, message: String) {
    eprintln!("{LOG_TAG} {message}");
    events::screenshot_error(app, AppError { code: ErrorCode::Internal, message });
}

async fn capture_on_main_thread(app: &AppHandle) -> Result<Option<Vec<u8>>, String> {
    let (done, wait) = tokio::sync::oneshot::channel();
    app.run_on_main_thread(move || {
        let _ = done.send(backend::capture_region());
    })
    .map_err(|e| e.to_string())?;
    wait.await.map_err(|e| e.to_string())?
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
    let Some(slot) = CaptureSlot::claim(app) else {
        return;
    };
    tauri::async_runtime::spawn(run_capture(app.clone(), slot));
}

async fn run_capture(app: AppHandle, _slot: CaptureSlot) {
    let was_visible = window::hide_for_screen_capture(&app).await;
    let restore = match capture_on_main_thread(&app).await {
        Ok(Some(png)) => {
            deliver(&app, png);
            true
        }
        Ok(None) => was_visible,
        Err(message) => {
            report_failure(&app, message);
            was_visible
        }
    };
    if restore {
        window::show_and_focus_prompt(&app);
    }
}

#[tauri::command]
#[specta::specta]
pub fn capture_region_screenshot(app: AppHandle) {
    on_capture_region(&app);
}
