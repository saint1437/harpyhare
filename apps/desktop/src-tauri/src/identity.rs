use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::AppHandle;

const LOG_TAG: &str = "[identity]";
const CONTENTS_DIR_NAME: &str = "Contents";
const RESOURCES_DIR_NAME: &str = "Resources";
const INFO_PLIST_FILE_NAME: &str = "Info.plist";
const APP_BUNDLE_EXTENSION: &str = "app";
const DEFAULT_ICON_FILE_NAME: &str = "icon.icns";
const ICNS_EXTENSION: &str = "icns";
const CFBUNDLE_EXECUTABLE_KEY: &str = "CFBundleExecutable";
const CFBUNDLE_NAME_KEY: &str = "CFBundleName";
const CFBUNDLE_DISPLAY_NAME_KEY: &str = "CFBundleDisplayName";
const CFBUNDLE_ICON_FILE_KEY: &str = "CFBundleIconFile";
const PRE_RELAUNCH_RENDER_DELAY: Duration = Duration::from_millis(300);
const ERR_DEV_MODE: &str =
    "Смена облика работает только в собранном .app (npm run tauri build), не в dev-режиме";

pub const ORIGINAL_DISPLAY_NAME: &str = "Audio System";

#[derive(Clone, Copy)]
pub struct IdentityDef {
    pub id: &'static str,
    pub display_name: &'static str,
    pub icns: &'static [u8],
    pub png: &'static [u8],
}

macro_rules! identity {
    ($id:literal, $name:literal, $dir:literal) => {
        IdentityDef {
            id: $id,
            display_name: $name,
            icns: include_bytes!(concat!("../identities/", $dir, "/icon.icns")),
            png: include_bytes!(concat!("../identities/", $dir, "/icon.png")),
        }
    };
}

pub const IDENTITIES: [IdentityDef; 8] = [
    identity!("calculator", "Calculator", "calculator"),
    identity!("notes", "Notes", "notes"),
    identity!("calendar", "Calendar", "calendar"),
    identity!("reminders", "Reminders", "reminders"),
    identity!("textedit", "TextEdit", "textedit"),
    identity!("console", "Console", "console"),
    identity!("preview", "Preview", "preview"),
    identity!("clock", "Clock", "clock"),
];

const ORIGINAL: IdentityDef = IdentityDef {
    id: "",
    display_name: ORIGINAL_DISPLAY_NAME,
    icns: include_bytes!("../icons/icon.icns"),
    png: include_bytes!("../icons/icon.png"),
};

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct IdentityInfo {
    pub id: String,
    pub display_name: String,
    pub icon_png_base64: String,
}

pub fn list() -> Vec<IdentityInfo> {
    IDENTITIES
        .iter()
        .map(|d| IdentityInfo {
            id: d.id.to_string(),
            display_name: d.display_name.to_string(),
            icon_png_base64: STANDARD.encode(d.png),
        })
        .collect()
}

pub(crate) fn find(id: &str) -> Option<IdentityDef> {
    if id.is_empty() {
        return Some(ORIGINAL);
    }
    IDENTITIES.iter().find(|d| d.id == id).copied()
}

pub fn is_known_id(id: &str) -> bool {
    find(id).is_some()
}

fn bundle_dirs() -> Result<(PathBuf, PathBuf, PathBuf), String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let macos_dir = exe.parent().ok_or(ERR_DEV_MODE)?.to_path_buf();
    let contents_dir = macos_dir.parent().ok_or(ERR_DEV_MODE)?.to_path_buf();
    let bundle_dir = contents_dir.parent().ok_or(ERR_DEV_MODE)?.to_path_buf();
    let is_bundle = contents_dir.file_name().and_then(|s| s.to_str()) == Some(CONTENTS_DIR_NAME)
        && bundle_dir.extension().and_then(|s| s.to_str()) == Some(APP_BUNDLE_EXTENSION);
    if !is_bundle {
        return Err(ERR_DEV_MODE.into());
    }
    Ok((bundle_dir, contents_dir, macos_dir))
}

fn icon_file_name(dict: &plist::Dictionary) -> String {
    let raw = dict
        .get(CFBUNDLE_ICON_FILE_KEY)
        .and_then(|v| v.as_string())
        .unwrap_or(DEFAULT_ICON_FILE_NAME);
    if Path::new(raw).extension().and_then(|e| e.to_str()) == Some(ICNS_EXTENSION) {
        raw.to_string()
    } else {
        format!("{raw}.{ICNS_EXTENSION}")
    }
}

fn resign_ad_hoc(bundle_dir: &Path) {
    let result = std::process::Command::new("codesign")
        .args(["--force", "--deep", "-s", "-"])
        .arg(bundle_dir)
        .output();
    match result {
        Ok(out) if !out.status.success() => {
            eprintln!("{LOG_TAG} codesign: {}", String::from_utf8_lossy(&out.stderr));
        }
        Err(e) => eprintln!("{LOG_TAG} codesign недоступен: {e}"),
        _ => {}
    }
}

fn apply_sync(id: &str) -> Result<PathBuf, String> {
    let def = find(id).ok_or_else(|| format!("Неизвестный облик: {id}"))?;
    let (bundle_dir, contents_dir, macos_dir) = bundle_dirs()?;

    let plist_path = contents_dir.join(INFO_PLIST_FILE_NAME);
    let mut root = plist::Value::from_file(&plist_path).map_err(|e| format!("Info.plist: {e}"))?;
    let dict = root
        .as_dictionary_mut()
        .ok_or_else(|| "Info.plist: неожиданный формат".to_string())?;

    let icon_name = icon_file_name(dict);
    std::fs::write(contents_dir.join(RESOURCES_DIR_NAME).join(&icon_name), def.icns)
        .map_err(|e| format!("иконка: {e}"))?;

    dict.insert(
        CFBUNDLE_EXECUTABLE_KEY.to_string(),
        plist::Value::String(def.display_name.to_string()),
    );
    dict.insert(
        CFBUNDLE_NAME_KEY.to_string(),
        plist::Value::String(def.display_name.to_string()),
    );
    dict.insert(
        CFBUNDLE_DISPLAY_NAME_KEY.to_string(),
        plist::Value::String(def.display_name.to_string()),
    );
    root.to_file_xml(&plist_path).map_err(|e| format!("Info.plist: {e}"))?;

    let old_exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
    let new_exe_path = macos_dir.join(def.display_name);
    if old_exe_path != new_exe_path {
        std::fs::rename(&old_exe_path, &new_exe_path).map_err(|e| format!("бинарь: {e}"))?;
    }

    resign_ad_hoc(&bundle_dir);
    Ok(new_exe_path)
}

pub async fn apply(app: &AppHandle, id: &str) -> Result<(), String> {
    let id = id.to_string();
    let new_exe_path = tokio::task::spawn_blocking(move || apply_sync(&id))
        .await
        .map_err(|e| e.to_string())??;

    tokio::time::sleep(PRE_RELAUNCH_RENDER_DELAY).await;
    std::process::Command::new(&new_exe_path)
        .spawn()
        .map_err(|e| format!("перезапуск: {e}"))?;
    app.exit(0);
    Ok(())
}
