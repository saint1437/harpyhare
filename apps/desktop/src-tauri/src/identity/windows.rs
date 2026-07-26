use std::path::PathBuf;
use std::time::Duration;
use tauri::AppHandle;

use super::IdentityDef;

const ERR_UNSUPPORTED: &str = "Смена облика доступна только на macOS";

pub const IDENTITIES: [IdentityDef; 0] = [];

pub const ORIGINAL: IdentityDef = IdentityDef {
    id: "",
    display_name: super::ORIGINAL_DISPLAY_NAME,
    icns: &[],
    png: include_bytes!("../../icons/icon.png"),
};

pub async fn prepare(_id: &str) -> Result<PathBuf, String> {
    Err(ERR_UNSUPPORTED.to_string())
}

pub async fn relaunch(
    _app: &AppHandle,
    _new_exe_path: PathBuf,
    _render_delay: Duration,
) -> Result<(), String> {
    Err(ERR_UNSUPPORTED.to_string())
}

pub async fn apply(_app: &AppHandle, _id: &str) -> Result<(), String> {
    Err(ERR_UNSUPPORTED.to_string())
}
