use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::app_state::{current_settings, App};
use crate::error::AppError;
use crate::sync::MutexExt;
use crate::{platform, recording};

#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum PermissionState {
    #[default]
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

#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct PermissionsStatus {
    pub audio: PermissionState,
    pub screen: PermissionState,
    pub microphone: PermissionState,
}

/// Re-exported from the capture domain so the fact lives in one place: it is a
/// property of the backend, and the platform-specific error wording derives from
/// the same constant (`capture::no_capture_error`).
pub const AUDIO_REQUIRES_PERMISSION: bool = crate::capture::REQUIRES_PERMISSION;

/// How long a probed answer is served from the cache before the next
/// `permissions_status` call kicks off a fresh background probe. Shorter than
/// the launcher's 1200 ms grant poll, so a granted permission still surfaces on
/// the very next poll — but the command itself never waits for a device.
const CACHE_TTL: Duration = Duration::from_millis(1000);

/// `permissions_status` used to open audio devices on the caller's thread:
/// `ensure_capture` → `build_capture`, which on Windows waits up to five seconds
/// for the WASAPI thread to come up. The launcher polls that command for its
/// readiness screen, and every poll blocked everyone waiting on the capture lock
/// — push-to-talk, auto listening, the audio check, `set_settings`. Worse, on
/// macOS the microphone probe IS the "first open" after which the real open
/// answers `kAudioHardwareIllegalOperationError` (see auto.rs).
///
/// So the command is now a pure read of this cache, and the probing happens off
/// the command thread: a background refresh the command schedules, or the
/// explicit `probe_permission`. One probe at a time (`probing`), never while a
/// capture is in use (`probing_would_disturb_audio`).
#[derive(Default)]
pub struct PermissionCache {
    state: Mutex<PermissionsStatus>,
    probed_at: Mutex<Option<Instant>>,
    probing: AtomicBool,
}

impl PermissionCache {
    pub fn snapshot(&self) -> PermissionsStatus {
        *self.state.lock_safe()
    }

    fn store(&self, status: PermissionsStatus) {
        *self.state.lock_safe() = status;
        *self.probed_at.lock_safe() = Some(Instant::now());
    }

    /// Records the screen answer WITHOUT stamping `probed_at`. The screen check
    /// is a preflight with no device behind it, so it can be answered eagerly —
    /// but the two device probes have not run, and marking the cache as probed
    /// would make `permissions_status` skip the awaited first probe and answer
    /// the launcher's readiness gate with `unknown` for audio.
    fn store_screen(&self, screen: PermissionState) {
        self.state.lock_safe().screen = screen;
    }

    fn is_stale(&self) -> bool {
        self.probed_at
            .lock_safe()
            .is_none_or(|at| at.elapsed() >= CACHE_TTL)
    }

    /// Nothing has ever been probed, so the snapshot is not an answer — it is
    /// the `unknown` a default carries.
    fn never_probed(&self) -> bool {
        self.probed_at.lock_safe().is_none()
    }

    /// A device change or an explicit grant makes the cached answer a lie
    /// immediately; dropping the timestamp lets the next status call re-probe.
    fn invalidate(&self) {
        *self.probed_at.lock_safe() = None;
    }
}

pub fn state_from_granted(granted: bool) -> PermissionState {
    if granted {
        PermissionState::Granted
    } else {
        PermissionState::Denied
    }
}

pub fn invalidate_cache(app: &AppHandle) {
    app.state::<App>().permissions.invalidate();
}

fn audio_state(app: &AppHandle) -> PermissionState {
    if !AUDIO_REQUIRES_PERMISSION {
        return PermissionState::Granted;
    }
    if app.state::<App>().capture.is_present() {
        return PermissionState::Granted;
    }
    if !current_settings(app).audio_permission_requested {
        return PermissionState::Unknown;
    }
    state_from_granted(recording::ensure_capture(app))
}

fn microphone_state(app: &AppHandle) -> PermissionState {
    if app.state::<App>().auto.has_microphone() {
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

/// Opening a device while one is already in use is not a probe, it is a
/// collision: the PTT session, auto mode and the audio check all hold the same
/// captures, and a speculative open in the middle of them either fails
/// spuriously or tears their stream down.
fn probing_would_disturb_audio(app: &AppHandle) -> bool {
    !app.state::<App>().capture.is_idle()
}

/// Runs the real (blocking) checks. Must never be called from a command thread.
fn probe_now(app: &AppHandle, kind: Option<PermissionKind>) -> PermissionsStatus {
    let cache = &app.state::<App>().permissions;
    let mut status = cache.snapshot();
    // The screen check is a cheap preflight with no device behind it, but it was
    // refreshed on EVERY pass through here — including the ones that turn
    // straight back below — so `CGPreflightScreenCaptureAccess` ran at least
    // once a second for as long as the launcher polled its readiness gate. It
    // answers to the same TTL as the two device probes now; a grant or a window
    // focus goes through `invalidate_cache`, which makes the cache stale at once
    // and lets the very next call through.
    if cache.is_stale() && kind.is_none_or(|k| k == PermissionKind::Screen) {
        status.screen = screen_state(app);
    }
    if probing_would_disturb_audio(app) {
        return status;
    }
    if kind.is_none_or(|k| k == PermissionKind::Audio) {
        status.audio = audio_state(app);
    }
    if kind.is_none_or(|k| k == PermissionKind::Microphone) {
        status.microphone = microphone_state(app);
    }
    status
}

fn refresh_blocking(app: &AppHandle, kind: Option<PermissionKind>) -> PermissionsStatus {
    let cache = &app.state::<App>().permissions;
    if cache.probing.swap(true, Ordering::AcqRel) {
        return cache.snapshot();
    }
    let status = probe_now(app, kind);
    cache.store(status);
    cache.probing.store(false, Ordering::Release);
    status
}

fn schedule_refresh(app: &AppHandle) {
    let cache = &app.state::<App>().permissions;
    if !cache.is_stale() || cache.probing.load(Ordering::Acquire) {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        refresh_blocking(&app, None);
    });
}

pub fn mark_requested(app: &AppHandle, kind: PermissionKind) -> Result<(), AppError> {
    app.state::<App>()
        .settings
        .update(|s| {
            let flag = match kind {
                PermissionKind::Audio => &mut s.audio_permission_requested,
                PermissionKind::Screen => &mut s.screen_permission_requested,
                PermissionKind::Microphone => &mut s.mic_permission_requested,
            };
            *flag = true;
        })
        .map(|_| ())
        .map_err(AppError::from)
}

/// A read of the cache. It never opens a device on the command's own thread —
/// that was the bug — but it is not allowed to answer `unknown` where a real
/// answer exists either: the launcher calls this ONCE on mount and then only on
/// window focus, so a cache that is still cold has to be filled before the
/// answer goes back, or the readiness gate stays shut on a machine that has the
/// permission.
///
/// So: the first call after start awaits one probe in `spawn_blocking`; every
/// call after that returns instantly and refreshes in the background. Awaiting
/// an async command does not occupy a command thread, which is the whole point.
#[tauri::command]
#[specta::specta]
pub async fn permissions_status(app: AppHandle) -> PermissionsStatus {
    if app.state::<App>().permissions.never_probed() {
        let handle = app.clone();
        if let Ok(status) = tauri::async_runtime::spawn_blocking(move || {
            refresh_blocking(&handle, None)
        })
        .await
        {
            return status;
        }
    }
    schedule_refresh(&app);
    app.state::<App>().permissions.snapshot()
}

/// Answers the ONE permission that can be answered for free while the launcher's
/// webview is still booting.
///
/// It used to run the full probe. That means `audio_state` → `ensure_capture` →
/// `build_capture`, and `microphone_state` → `build_mic_capture`: two device
/// opens at every launch, hundreds of milliseconds each and up to five seconds
/// on Windows, and on macOS the microphone open blinks the recording indicator
/// in the menu bar before the user has asked for anything. Neither answer is
/// needed until the readiness gate asks — and `permissions_status` awaits a full
/// probe on its first call precisely so that it does not have to be pre-filled.
pub fn warm_cache(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let screen = screen_state(&app);
        app.state::<App>().permissions.store_screen(screen);
    });
}

/// The explicit, awaited version of the same probe: the caller gets the answer
/// for one permission rather than whatever the cache happened to hold. Runs in
/// `spawn_blocking` — opening a capture device takes hundreds of milliseconds
/// and up to five seconds on Windows.
#[tauri::command]
#[specta::specta]
pub async fn probe_permission(app: AppHandle, kind: PermissionKind) -> PermissionState {
    let handle = app.clone();
    let status = tauri::async_runtime::spawn_blocking(move || refresh_blocking(&handle, Some(kind)))
        .await
        .unwrap_or_else(|_| app.state::<App>().permissions.snapshot());
    state_of(&status, kind)
}

fn state_of(status: &PermissionsStatus, kind: PermissionKind) -> PermissionState {
    match kind {
        PermissionKind::Audio => status.audio,
        PermissionKind::Screen => status.screen,
        PermissionKind::Microphone => status.microphone,
    }
}

#[tauri::command]
#[specta::specta]
pub async fn request_permission(
    app: AppHandle,
    kind: PermissionKind,
) -> Result<PermissionState, AppError> {
    mark_requested(&app, kind)?;
    invalidate_cache(&app);
    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || grant_blocking(&handle, kind))
        .await
        .map_err(|e| crate::error::internal(e.to_string()))
}

/// Raising the system prompt means opening the device (macOS has no preflight
/// for audio), which is exactly the slow work `request_permission` must keep off
/// the command thread.
fn grant_blocking(app: &AppHandle, kind: PermissionKind) -> PermissionState {
    let granted = match kind {
        PermissionKind::Audio => {
            if !AUDIO_REQUIRES_PERMISSION {
                true
            } else {
                recording::rebuild_capture(app)
            }
        }
        PermissionKind::Screen => platform::request_screen_capture_access(),
        PermissionKind::Microphone => probe_microphone(app),
    };
    let state = state_from_granted(granted);
    let cache = &app.state::<App>().permissions;
    let mut status = cache.snapshot();
    match kind {
        PermissionKind::Audio => status.audio = state,
        PermissionKind::Screen => status.screen = state,
        PermissionKind::Microphone => status.microphone = state,
    }
    cache.store(status);
    state
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
