use tauri::AppHandle;

use crate::app_state::{chat_images_dir, chats_path, context_library_path};
use crate::chat_images::StoredImage;
use crate::{chat_images, chats, context_import};

const IMAGE_DECODE_ERROR: &str = "не удалось разобрать картинку";

#[tauri::command]
#[specta::specta]
pub fn load_chats(app: AppHandle) -> String {
    chats::load(&chats_path(&app))
}

#[tauri::command]
#[specta::specta]
pub fn save_chats(app: AppHandle, json: String) -> Result<(), String> {
    chats::save(&chats_path(&app), &json).map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub fn load_context_library(app: AppHandle) -> String {
    chats::load(&context_library_path(&app))
}

#[tauri::command]
#[specta::specta]
pub fn save_context_library(app: AppHandle, json: String) -> Result<(), String> {
    chats::save(&context_library_path(&app), &json).map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn read_context_import_file(path: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        context_import::read_import_file(std::path::Path::new(&path))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
#[specta::specta]
pub async fn read_context_pdf_bytes(data_base64: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || context_import::read_pdf_base64(&data_base64))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
#[specta::specta]
pub async fn save_chat_image(
    app: AppHandle,
    media_type: String,
    data_base64: String,
) -> Result<String, String> {
    use base64::Engine;
    let dir = chat_images_dir(&app);
    tokio::task::spawn_blocking(move || {
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(data_base64.trim())
            .map_err(|_| IMAGE_DECODE_ERROR.to_string())?;
        chat_images::save(&dir, &media_type, &bytes)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
#[specta::specta]
pub async fn load_chat_images(app: AppHandle, ids: Vec<String>) -> Vec<StoredImage> {
    let dir = chat_images_dir(&app);
    tokio::task::spawn_blocking(move || chat_images::load(&dir, &ids))
        .await
        .unwrap_or_default()
}

#[tauri::command]
#[specta::specta]
pub async fn prune_chat_images(app: AppHandle, keep: Vec<String>) {
    let dir = chat_images_dir(&app);
    let _ = tokio::task::spawn_blocking(move || chat_images::prune(&dir, &keep)).await;
}
