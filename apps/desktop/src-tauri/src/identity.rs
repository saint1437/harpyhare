use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Serialize;
use std::path::PathBuf;
use std::time::Duration;
use tauri::AppHandle;

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;

#[cfg(target_os = "macos")]
use macos as backend;
#[cfg(target_os = "windows")]
use windows as backend;

pub const PRE_RELAUNCH_RENDER_DELAY: Duration = Duration::from_millis(300);
pub const ORIGINAL_DISPLAY_NAME: &str = "Audio System";

#[derive(Clone, Copy)]
pub struct IdentityDef {
    pub id: &'static str,
    pub display_name: &'static str,
    pub icns: &'static [u8],
    pub png: &'static [u8],
}

#[derive(Serialize, Clone, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct IdentityInfo {
    pub id: String,
    pub display_name: String,
    pub icon_png_base64: String,
}

pub fn list() -> Vec<IdentityInfo> {
    std::iter::once(&backend::ORIGINAL)
        .chain(backend::IDENTITIES.iter())
        .map(|d| IdentityInfo {
            id: d.id.to_string(),
            display_name: d.display_name.to_string(),
            icon_png_base64: STANDARD.encode(d.png),
        })
        .collect()
}

pub(crate) fn find(id: &str) -> Option<IdentityDef> {
    if id.is_empty() {
        return Some(backend::ORIGINAL);
    }
    backend::IDENTITIES.iter().find(|d| d.id == id).copied()
}

pub fn is_known_id(id: &str) -> bool {
    find(id).is_some()
}

pub async fn prepare(id: &str) -> Result<PathBuf, String> {
    backend::prepare(id).await
}

pub async fn relaunch(
    app: &AppHandle,
    new_exe_path: PathBuf,
    render_delay: Duration,
) -> Result<(), String> {
    backend::relaunch(app, new_exe_path, render_delay).await
}

pub async fn apply(app: &AppHandle, id: &str) -> Result<(), String> {
    backend::apply(app, id).await
}
