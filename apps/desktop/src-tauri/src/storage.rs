use tauri::AppHandle;

use crate::app_state::{chats_path, context_library_path};
use crate::{chats, context_import};

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
