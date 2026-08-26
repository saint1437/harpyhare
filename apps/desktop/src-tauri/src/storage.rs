use tauri::AppHandle;

use crate::app_state::{chat_images_dir, chats_path, context_library_path};
use crate::chat_images::StoredImage;
use crate::error::{internal, AppError};
use crate::{chat_images, chats, context_import};

const IMAGE_DECODE_ERROR: &str = "не удалось разобрать картинку";

/// `Ok(None)` from the store means "no file yet"; the frontend's contract is a
/// string, and an empty one is what it already treats as "nothing saved". Every
/// other failure now travels as an error instead of masquerading as emptiness.
fn loaded_or_empty(document: Option<String>) -> String {
    document.unwrap_or_default()
}

#[tauri::command]
#[specta::specta]
pub fn load_chats(app: AppHandle) -> Result<String, AppError> {
    Ok(loaded_or_empty(chats::load(&chats_path(&app)?)?))
}

#[tauri::command]
#[specta::specta]
pub fn save_chats(app: AppHandle, json: String) -> Result<(), AppError> {
    chats::save(&chats_path(&app)?, &json).map_err(AppError::from)
}

#[tauri::command]
#[specta::specta]
pub fn load_context_library(app: AppHandle) -> Result<String, AppError> {
    Ok(loaded_or_empty(chats::load(&context_library_path(&app)?)?))
}

#[tauri::command]
#[specta::specta]
pub fn save_context_library(app: AppHandle, json: String) -> Result<(), AppError> {
    chats::save(&context_library_path(&app)?, &json).map_err(AppError::from)
}

#[tauri::command]
#[specta::specta]
pub async fn read_context_import_file(path: String) -> Result<String, AppError> {
    tokio::task::spawn_blocking(move || {
        context_import::read_import_file(std::path::Path::new(&path))
    })
    .await
    .map_err(|e| internal(e.to_string()))?
    .map_err(context_import::to_app_error)
}

#[tauri::command]
#[specta::specta]
pub async fn read_context_pdf_bytes(data_base64: String) -> Result<String, AppError> {
    tokio::task::spawn_blocking(move || context_import::read_pdf_base64(&data_base64))
        .await
        .map_err(|e| internal(e.to_string()))?
        .map_err(context_import::to_app_error)
}

#[tauri::command]
#[specta::specta]
pub async fn save_chat_image(
    app: AppHandle,
    media_type: String,
    data_base64: String,
) -> Result<String, AppError> {
    use base64::Engine;
    let dir = chat_images_dir(&app)?;
    tokio::task::spawn_blocking(move || {
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(data_base64.trim())
            .map_err(|_| IMAGE_DECODE_ERROR.to_string())?;
        chat_images::save(&dir, &media_type, &bytes)
    })
    .await
    .map_err(|e| internal(e.to_string()))?
    .map_err(context_import::to_app_error)
}

#[tauri::command]
#[specta::specta]
pub async fn load_chat_images(app: AppHandle, ids: Vec<String>) -> Vec<StoredImage> {
    let Ok(dir) = chat_images_dir(&app) else {
        return Vec::new();
    };
    tokio::task::spawn_blocking(move || chat_images::load(&dir, &ids))
        .await
        .unwrap_or_default()
}

#[tauri::command]
#[specta::specta]
pub async fn prune_chat_images(app: AppHandle, keep: Vec<String>) {
    let Ok(dir) = chat_images_dir(&app) else {
        return;
    };
    let _ = tokio::task::spawn_blocking(move || chat_images::prune(&dir, &keep)).await;
}
