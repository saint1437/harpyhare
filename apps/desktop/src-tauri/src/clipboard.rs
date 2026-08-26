use base64::Engine;
use tauri::AppHandle;
use tauri_plugin_clipboard_manager::ClipboardExt;

use crate::error::{AppError, ErrorCode};

const DECODE_ERROR: &str = "Не удалось разобрать картинку для буфера обмена";
const WRITE_ERROR: &str = "Не удалось положить картинку в буфер обмена";

pub fn write_png(app: &AppHandle, png: &[u8]) {
    if let Ok(image) = tauri::image::Image::from_bytes(png) {
        let _ = app.clipboard().write_image(&image);
    }
}

#[tauri::command]
#[specta::specta]
pub fn copy_image_to_clipboard(app: AppHandle, data_base64: String) -> Result<(), AppError> {
    let decode_error = || {
        AppError::with_subject(
            ErrorCode::Internal,
            DECODE_ERROR,
            crate::error::subject::CLIPBOARD_DECODE,
        )
    };
    let png = base64::engine::general_purpose::STANDARD
        .decode(data_base64)
        .map_err(|_| decode_error())?;
    let image = tauri::image::Image::from_bytes(&png).map_err(|_| decode_error())?;
    app.clipboard()
        .write_image(&image)
        .map_err(|_| {
            AppError::with_subject(
                ErrorCode::Internal,
                WRITE_ERROR,
                crate::error::subject::CLIPBOARD_WRITE,
            )
        })
}
