use std::ffi::{c_char, CStr};

use base64::Engine;
use tauri::AppHandle;

use crate::error::{AppError, ErrorCode};
use crate::{events, platform, window};

pub const SCREENSHOT_MEDIA_TYPE: &str = "image/png";

const CAPTURE_OK: i32 = 0;
const CAPTURE_CANCELLED: i32 = 1;
const ERROR_BUFFER_LEN: usize = 256;
const LOG_TAG: &str = "[screenshot]";
const NO_PERMISSION_MESSAGE: &str =
    "Нет разрешения «Запись экрана». Выдай его в системных настройках и повтори.";
const EMPTY_CAPTURE_MESSAGE: &str = "Снимок пустой";

extern "C" {
    fn harpy_capture_region(
        out_png: *mut *mut u8,
        out_len: *mut usize,
        err: *mut c_char,
        err_len: usize,
    ) -> i32;
    fn harpy_capture_region_free(png: *mut u8);
}

fn capture_region_png() -> Result<Option<Vec<u8>>, String> {
    let mut png: *mut u8 = std::ptr::null_mut();
    let mut len: usize = 0;
    let mut err = [0 as c_char; ERROR_BUFFER_LEN];
    let code = unsafe { harpy_capture_region(&mut png, &mut len, err.as_mut_ptr(), err.len()) };
    match code {
        CAPTURE_OK => {
            if png.is_null() || len == 0 {
                return Err(EMPTY_CAPTURE_MESSAGE.to_string());
            }
            let bytes = unsafe { std::slice::from_raw_parts(png, len) }.to_vec();
            unsafe { harpy_capture_region_free(png) };
            Ok(Some(bytes))
        }
        CAPTURE_CANCELLED => Ok(None),
        _ => Err(unsafe { CStr::from_ptr(err.as_ptr()) }
            .to_string_lossy()
            .into_owned()),
    }
}

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
    let _ = app.clone().run_on_main_thread(move || match capture_region_png() {
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
