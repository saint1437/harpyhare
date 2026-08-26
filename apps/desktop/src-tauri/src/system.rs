use tauri::{AppHandle, Manager};

use crate::app_state::App;
use crate::error::AppError;
use crate::{platform, update};

#[tauri::command]
#[specta::specta]
pub fn open_external(url: String) {
    platform::open_web_url(&url);
}

#[tauri::command]
#[specta::specta]
pub fn set_preview_html(app: AppHandle, html: String) {
    app.state::<App>().window.set_preview_html(html);
}

#[tauri::command]
#[specta::specta]
pub async fn check_for_update(app: AppHandle) -> Result<Option<update::UpdateInfo>, AppError> {
    update::check(&app).await
}

#[tauri::command]
#[specta::specta]
pub async fn install_update(app: AppHandle) -> Result<(), AppError> {
    update::install(app).await
}

#[tauri::command]
#[specta::specta]
pub fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").into()
}

