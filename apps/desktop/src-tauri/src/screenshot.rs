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

/// The region-selection overlay. One function, but the same reason as
/// `capture::CaptureBackend`: a third platform must fail to compile with a
/// message naming what is missing, not with `unresolved import backend`.
pub trait ScreenshotBackend {
    /// `Ok(None)` = the user cancelled the selection.
    fn capture_region() -> Result<Option<Vec<u8>>, String>;
}

#[cfg(target_os = "macos")]
type Backend = macos::Backend;
#[cfg(target_os = "windows")]
type Backend = windows::Backend;

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
compile_error!(
    "снимок области реализован только для macOS и Windows: \
     добавьте модуль screenshot/<os>.rs с `impl ScreenshotBackend`"
);

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

/// The re-entry guard: a second region screenshot while the overlay is up would
/// hide the HUD twice and restore it once.
#[derive(Default)]
pub struct ScreenshotState(std::sync::atomic::AtomicBool);

impl ScreenshotState {
    fn claim(&self) -> bool {
        !self.0.swap(true, Ordering::SeqCst)
    }

    fn release(&self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

struct CaptureSlot(AppHandle);

impl CaptureSlot {
    fn claim(app: &AppHandle) -> Option<Self> {
        app.state::<App>()
            .screenshot
            .claim()
            .then(|| Self(app.clone()))
    }
}

impl Drop for CaptureSlot {
    fn drop(&mut self) {
        self.0.state::<App>().screenshot.release();
    }
}

fn report_failure(app: &AppHandle, message: String) {
    eprintln!("{LOG_TAG} {message}");
    events::screenshot_error(app, crate::error::internal(message));
}

async fn capture_on_main_thread(app: &AppHandle) -> Result<Option<Vec<u8>>, String> {
    let (done, wait) = tokio::sync::oneshot::channel();
    app.run_on_main_thread(move || {
        let _ = done.send(Backend::capture_region());
    })
    .map_err(|e| e.to_string())?;
    wait.await.map_err(|e| e.to_string())?
}

pub fn on_capture_region(app: &AppHandle) {
    if !platform::screen_capture_access() {
        events::screenshot_error(
            app,
            AppError::with_subject(
                ErrorCode::Permission,
                NO_PERMISSION_MESSAGE,
                crate::error::subject::SCREEN_RECORDING,
            ),
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
    let mut captured = false;
    let restore = match capture_on_main_thread(&app).await {
        Ok(Some(png)) => {
            deliver(&app, png);
            captured = true;
            true
        }
        Ok(None) => was_visible,
        Err(message) => {
            report_failure(&app, message);
            was_visible
        }
    };
    if restore {
        if captured {
            // A shot taken from the orb: without expanding, the screenshot lands
            // silently in an invisible chat's draft and focus goes to the orb.
            // With the window already expanded set_collapsed is a no-op; on
            // cancel and error the orb stays an orb.
            window::set_collapsed(&app, false, false);
        }
        window::show_and_focus_prompt(&app);
    }
}

#[tauri::command]
#[specta::specta]
pub fn capture_region_screenshot(app: AppHandle) {
    on_capture_region(&app);
}
