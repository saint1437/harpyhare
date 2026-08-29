use std::path::PathBuf;
use std::sync::atomic::Ordering;

use tauri::{AppHandle, Manager};

use crate::app_state::{chat_images_dir, App};
use crate::error::{AppError, ErrorCode};
use crate::{chat_images, events, platform, window};

#[cfg(target_os = "macos")]
mod macos;
pub mod resample;
#[cfg(target_os = "windows")]
mod windows;

/// The region-selection overlay. One trait, but the same reason as
/// `capture::CaptureBackend`: a third platform must fail to compile with a
/// message naming what is missing, not with `unresolved import backend`.
///
/// It is split in two because only the FIRST half belongs to the main thread.
/// `run_on_main_thread` freezes the app's event loop for as long as the closure
/// runs, and a full-screen selection on a 4K monitor is ~25 MB of pixels going
/// through deflate — hundreds of milliseconds, up to a second. Capturing needs
/// the main thread (AppKit, the overlay's nested message loop); turning the
/// result into a PNG does not, so it happens in `spawn_blocking`.
pub trait ScreenshotBackend {
    /// Whatever the overlay leaves behind: cheap to produce on the main thread,
    /// expensive to turn into a PNG.
    type Capture: Send + 'static;

    /// Runs the overlay and cuts the selection out of the screen copy. Main
    /// thread only. `Ok(None)` = the user cancelled the selection.
    fn capture_region() -> Result<Option<Self::Capture>, String>;

    /// Turns the selection into the PNG the frontend receives — resolution cap
    /// included. Must NOT be called on the main thread.
    fn encode_png(capture: Self::Capture) -> Result<Vec<u8>, String>;
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

type Captured = <Backend as ScreenshotBackend>::Capture;

pub const SCREENSHOT_MEDIA_TYPE: &str = "image/png";

const LOG_TAG: &str = "[screenshot]";
const NO_PERMISSION_MESSAGE: &str =
    "Нет разрешения «Запись экрана». Выдай его в системных настройках и повтори.";

/// The write goes to a blocking thread, and the PNG comes back out with it:
/// the clipboard branch still needs those bytes, and moving the `Vec` through
/// the closure is free where a clone would be one more full copy of the image.
async fn store_png(dir: PathBuf, png: Vec<u8>) -> (Result<String, String>, Vec<u8>) {
    tauri::async_runtime::spawn_blocking(move || {
        let stored = chat_images::save(&dir, SCREENSHOT_MEDIA_TYPE, &png);
        (stored, png)
    })
    .await
    .unwrap_or_else(|e| (Err(e.to_string()), Vec::new()))
}

/// Answers whether the shot actually reached the composer.
///
/// **The picture never crosses the IPC boundary.** It is written into the
/// chat-image store here and the event carries its id; the frontend asks
/// `load_chat_images` for the bytes it needs to draw the thumbnail. The old
/// route base64'd the PNG into the event, had the frontend decode it back into
/// a `File`, let a `FileReader` re-encode it and sent that string back to
/// `save_chat_image` — three base64 conversions and a dozen simultaneous copies
/// of a multi-megabyte buffer to file bytes this process was already holding.
///
/// The event still goes out BEFORE the clipboard copy, for its original reason:
/// `clipboard::write_png` hands the bytes to `tauri::image::Image::from_bytes`,
/// which decodes the whole PNG back to RGBA — ~100 ms of CPU that has no
/// business sitting between the capture and the event the composer is waiting
/// for, on a tokio worker an in-flight LLM stream is sharing.
async fn deliver(app: &AppHandle, png: Vec<u8>) -> bool {
    let dir = match chat_images_dir(app) {
        Ok(dir) => dir,
        Err(error) => {
            report_failure(app, error.message);
            return false;
        }
    };
    let (stored, png) = store_png(dir, png).await;
    let id = match stored {
        Ok(id) => id,
        Err(message) => {
            report_failure(app, message);
            return false;
        }
    };
    events::screenshot_ready(
        app,
        events::ScreenshotReady {
            id,
            media_type: SCREENSHOT_MEDIA_TYPE.to_string(),
        },
    );
    copy_to_clipboard_if_enabled(app, png);
    true
}

fn copy_to_clipboard_if_enabled(app: &AppHandle, png: Vec<u8>) {
    if !crate::app_state::current_settings(app).copy_results_to_clipboard {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || crate::clipboard::write_png(&app, &png));
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

async fn capture_on_main_thread(app: &AppHandle) -> Result<Option<Captured>, String> {
    let (done, wait) = tokio::sync::oneshot::channel();
    app.run_on_main_thread(move || {
        let _ = done.send(Backend::capture_region());
    })
    .map_err(|e| e.to_string())?;
    wait.await.map_err(|e| e.to_string())?
}

async fn encode_off_main_thread(capture: Captured) -> Result<Vec<u8>, String> {
    tauri::async_runtime::spawn_blocking(move || Backend::encode_png(capture))
        .await
        .map_err(|e| e.to_string())?
}

/// The two halves of a shot, each on the thread it belongs to.
async fn capture_png(app: &AppHandle) -> Result<Option<Vec<u8>>, String> {
    let Some(capture) = capture_on_main_thread(app).await? else {
        return Ok(None);
    };
    encode_off_main_thread(capture).await.map(Some)
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
    let restore = match capture_png(&app).await {
        Ok(Some(png)) => {
            captured = deliver(&app, png).await;
            // A delivered shot always brings the window back; a store that
            // failed behaves like any other failure and leaves it as it was.
            captured || was_visible
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
