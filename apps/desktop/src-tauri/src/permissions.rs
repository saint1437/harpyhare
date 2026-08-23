use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::app_state::{current_settings, settings_path, App};
use crate::{platform, recording};

#[derive(Debug, Clone, Copy, PartialEq, Serialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum PermissionState {
    Unknown,
    Granted,
    Denied,
}

#[derive(Debug, Clone, Copy, PartialEq, Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum PermissionKind {
    Audio,
    Screen,
    Microphone,
}

#[derive(Debug, Clone, PartialEq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct PermissionsStatus {
    pub audio: PermissionState,
    pub screen: PermissionState,
    pub microphone: PermissionState,
}

pub const AUDIO_REQUIRES_PERMISSION: bool = cfg!(target_os = "macos");
pub const MICROPHONE_REQUIRES_PERMISSION: bool = true;

pub fn state_from_granted(granted: bool) -> PermissionState {
    if granted {
        PermissionState::Granted
    } else {
        PermissionState::Denied
    }
}

fn audio_state(app: &AppHandle) -> PermissionState {
    if !AUDIO_REQUIRES_PERMISSION {
        return PermissionState::Granted;
    }
    if app.state::<App>().capture.lock().unwrap().is_some() {
        return PermissionState::Granted;
    }
    if !current_settings(app).audio_permission_requested {
        return PermissionState::Unknown;
    }
    state_from_granted(recording::ensure_capture(app))
}

fn microphone_state(app: &AppHandle) -> PermissionState {
    if app.state::<App>().mic_capture.lock().unwrap().is_some() {
        return PermissionState::Granted;
    }
    if !current_settings(app).mic_permission_requested {
        return PermissionState::Unknown;
    }
    state_from_granted(probe_microphone(app))
}

fn probe_microphone(app: &AppHandle) -> bool {
    crate::app_state::build_mic_capture(&current_settings(app)).is_ok()
}

fn screen_state(app: &AppHandle) -> PermissionState {
    if platform::screen_capture_access() {
        return PermissionState::Granted;
    }
    if current_settings(app).screen_permission_requested {
        PermissionState::Denied
    } else {
        PermissionState::Unknown
    }
}

pub fn mark_requested(app: &AppHandle, kind: PermissionKind) -> Result<(), String> {
    let st = app.state::<App>();
    let mut settings = st.settings.lock().unwrap().clone();
    let flag = match kind {
        PermissionKind::Audio => &mut settings.audio_permission_requested,
        PermissionKind::Screen => &mut settings.screen_permission_requested,
        PermissionKind::Microphone => &mut settings.mic_permission_requested,
    };
    if *flag {
        return Ok(());
    }
    *flag = true;
    settings
        .save(&settings_path(app))
        .map_err(|e| e.to_string())?;
    *st.settings.lock().unwrap() = settings;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn permissions_status(app: AppHandle) -> PermissionsStatus {
    PermissionsStatus {
        audio: audio_state(&app),
        screen: screen_state(&app),
        microphone: microphone_state(&app),
    }
}

#[tauri::command]
#[specta::specta]
pub fn request_permission(app: AppHandle, kind: PermissionKind) -> Result<PermissionState, String> {
    match kind {
        PermissionKind::Audio => {
            if !AUDIO_REQUIRES_PERMISSION {
                return Ok(PermissionState::Granted);
            }
            mark_requested(&app, kind)?;
            Ok(state_from_granted(recording::rebuild_capture(&app)))
        }
        PermissionKind::Screen => {
            mark_requested(&app, kind)?;
            Ok(state_from_granted(platform::request_screen_capture_access()))
        }
        PermissionKind::Microphone => {
            mark_requested(&app, kind)?;
            Ok(state_from_granted(probe_microphone(&app)))
        }
    }
}

#[tauri::command]
#[specta::specta]
pub fn open_permission_settings(kind: PermissionKind) {
    match kind {
        PermissionKind::Audio => platform::open_audio_capture_privacy_pane(),
        PermissionKind::Screen => platform::open_screen_capture_privacy_pane(),
        PermissionKind::Microphone => platform::open_microphone_privacy_pane(),
    }
}

#[cfg(test)]
mod tests;
