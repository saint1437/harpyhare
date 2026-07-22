use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Serialize;
use std::ffi::OsStr;
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
const TMP_FILE_SUFFIX: &str = "identity-tmp";
const CODESIGN_COMMAND: &str = "codesign";
const TOUCH_COMMAND: &str = "/usr/bin/touch";
pub const PRE_RELAUNCH_RENDER_DELAY: Duration = Duration::from_millis(300);
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
    identity!("obsidian", "Obsidian", "obsidian"),
    identity!("spotify", "Spotify", "spotify"),
    identity!("protonvpn", "Proton VPN", "protonvpn"),
    identity!("discord", "Discord", "discord"),
    identity!("androidstudio", "Android Studio", "androidstudio"),
    identity!("steam", "Steam", "steam"),
    identity!("displaybuddy", "DisplayBuddy", "displaybuddy"),
    identity!("unarchiver", "The Unarchiver", "unarchiver"),
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
    std::iter::once(&ORIGINAL)
        .chain(IDENTITIES.iter())
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

fn set_identity_keys(dict: &mut plist::Dictionary, display_name: &str) {
    for key in [
        CFBUNDLE_EXECUTABLE_KEY,
        CFBUNDLE_NAME_KEY,
        CFBUNDLE_DISPLAY_NAME_KEY,
    ] {
        dict.insert(key.to_string(), plist::Value::String(display_name.to_string()));
    }
}

fn tmp_sibling(path: &Path) -> PathBuf {
    let mut file_name = path
        .file_name()
        .unwrap_or(OsStr::new(TMP_FILE_SUFFIX))
        .to_os_string();
    file_name.push(".");
    file_name.push(TMP_FILE_SUFFIX);
    path.with_file_name(file_name)
}

fn write_file_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let tmp = tmp_sibling(path);
    std::fs::write(&tmp, bytes)?;
    std::fs::rename(&tmp, path)
}

fn write_plist_atomic(root: &plist::Value, path: &Path) -> Result<(), String> {
    let tmp = tmp_sibling(path);
    root.to_file_xml(&tmp).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, path).map_err(|e| e.to_string())
}

fn link_executable_alias(old_exe_path: &Path, new_exe_path: &Path) -> std::io::Result<()> {
    if new_exe_path == old_exe_path {
        return Ok(());
    }
    if new_exe_path.exists() {
        std::fs::remove_file(new_exe_path)?;
    }
    std::fs::hard_link(old_exe_path, new_exe_path)
}

fn remove_superseded_executable(old_exe_path: &Path, new_exe_path: &Path) -> std::io::Result<()> {
    if new_exe_path == old_exe_path {
        return Ok(());
    }
    std::fs::remove_file(old_exe_path)
}

fn resign_ad_hoc(bundle_dir: &Path) {
    let result = std::process::Command::new(CODESIGN_COMMAND)
        .args(["--force", "-s", "-"])
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

fn bump_bundle_mtime(bundle_dir: &Path) {
    let _ = std::process::Command::new(TOUCH_COMMAND)
        .arg(bundle_dir)
        .output();
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
    set_identity_keys(dict, def.display_name);

    let old_exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
    let new_exe_path = macos_dir.join(def.display_name);

    write_file_atomic(
        &contents_dir.join(RESOURCES_DIR_NAME).join(&icon_name),
        def.icns,
    )
    .map_err(|e| format!("иконка: {e}"))?;

    link_executable_alias(&old_exe_path, &new_exe_path).map_err(|e| format!("бинарь: {e}"))?;
    write_plist_atomic(&root, &plist_path).map_err(|e| format!("Info.plist: {e}"))?;
    remove_superseded_executable(&old_exe_path, &new_exe_path)
        .map_err(|e| format!("бинарь: {e}"))?;

    resign_ad_hoc(&bundle_dir);
    bump_bundle_mtime(&bundle_dir);
    Ok(new_exe_path)
}

pub async fn prepare(id: &str) -> Result<PathBuf, String> {
    let id = id.to_string();
    tokio::task::spawn_blocking(move || apply_sync(&id))
        .await
        .map_err(|e| e.to_string())?
}

pub async fn relaunch(
    app: &AppHandle,
    new_exe_path: PathBuf,
    render_delay: Duration,
) -> Result<(), String> {
    if !render_delay.is_zero() {
        tokio::time::sleep(render_delay).await;
    }
    std::process::Command::new(&new_exe_path)
        .spawn()
        .map_err(|e| format!("перезапуск: {e}"))?;
    app.exit(0);
    Ok(())
}

pub async fn apply(app: &AppHandle, id: &str) -> Result<(), String> {
    let new_exe_path = prepare(id).await?;
    relaunch(app, new_exe_path, Duration::ZERO).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dict_with_icon(value: &str) -> plist::Dictionary {
        let mut d = plist::Dictionary::new();
        d.insert(
            CFBUNDLE_ICON_FILE_KEY.to_string(),
            plist::Value::String(value.to_string()),
        );
        d
    }

    #[test]
    fn icon_file_name_appends_icns_when_extension_missing() {
        assert_eq!(icon_file_name(&dict_with_icon("icon")), "icon.icns");
        assert_eq!(icon_file_name(&dict_with_icon("AppIcon")), "AppIcon.icns");
    }

    #[test]
    fn icon_file_name_keeps_existing_icns() {
        assert_eq!(icon_file_name(&dict_with_icon("AppIcon.icns")), "AppIcon.icns");
    }

    #[test]
    fn icon_file_name_defaults_when_key_absent() {
        assert_eq!(
            icon_file_name(&plist::Dictionary::new()),
            DEFAULT_ICON_FILE_NAME
        );
    }

    #[test]
    fn find_empty_id_returns_original() {
        let def = find("").expect("empty id maps to original");
        assert_eq!(def.id, "");
        assert_eq!(def.display_name, ORIGINAL_DISPLAY_NAME);
    }

    #[test]
    fn find_and_is_known_id_cover_known_and_unknown() {
        assert!(find("obsidian").is_some());
        assert!(find("not-a-real-identity").is_none());
        assert!(is_known_id("obsidian"));
        assert!(is_known_id(""));
        assert!(!is_known_id("not-a-real-identity"));
    }

    #[test]
    fn list_starts_with_original_then_all_identities() {
        let listed = list();
        assert_eq!(listed.len(), IDENTITIES.len() + 1);
        assert_eq!(listed[0].id, "");
        assert_eq!(listed[0].display_name, ORIGINAL_DISPLAY_NAME);
        assert!(!listed[0].icon_png_base64.is_empty());
        assert_eq!(listed[1].id, IDENTITIES[0].id);
    }

    #[test]
    fn tmp_sibling_appends_suffix_next_to_target() {
        let p = Path::new("/x/Contents/Info.plist");
        assert_eq!(
            tmp_sibling(p),
            PathBuf::from("/x/Contents/Info.plist.identity-tmp")
        );
    }
}
