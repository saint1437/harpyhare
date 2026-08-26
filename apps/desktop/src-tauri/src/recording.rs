//! The Tauri half of push-to-talk: the commands, the device-change listener and
//! the `RecordingHost` implementation. Everything that decides anything lives in
//! `recording_service.rs`.

use std::time::Duration;

use tauri::{AppHandle, Manager};

use crate::app_state::{build_capture, current_settings, llm_provider, stt_engine, App};
use crate::error::{AppError, ErrorCode};
use crate::recording_service::{RecordingHost, WatchdogTick};
use crate::{auto, capture, hotkey};

/// The shared "no capture" text for auto.rs and audio_check.rs: the user-facing
/// wording must be single-sourced, otherwise two copies drift silently.
pub const ERR_NO_SYSTEM_CAPTURE: &str = "Захват системного звука недоступен";

const MAX_DURATION_WATCHDOG_INTERVAL: Duration = Duration::from_secs(1);

pub fn install_default_output_device_listener(app: &AppHandle) {
    let app = app.clone();
    capture::watch_default_output_device(Box::new(move || {
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            handle_default_output_device_changed(&app);
        });
    }));
}

fn handle_default_output_device_changed(app: &AppHandle) {
    let follows_system_default = current_settings(app).capture_device_uid.is_empty();
    if follows_system_default {
        request_capture_rebuild(app);
    }
}

pub fn request_capture_rebuild(app: &AppHandle) {
    let st = app.state::<App>();
    if st.recording.is_idle() {
        rebuild_capture_now(app);
    } else {
        st.recording.defer_capture_rebuild();
    }
}

pub fn rebuild_capture(app: &AppHandle) -> bool {
    let st = app.state::<App>();
    let new_capture = build_capture(&current_settings(app));
    let built = new_capture.is_some();
    let auto_live = auto::is_active(app);
    if auto_live {
        // The fresh capture is built from settings.buffer_enabled and with no
        // segmenter, while auto mode lived on the previous one: without forced
        // buffering the consumer parks and the interviewer's turns die silently
        // — with the HUD still honestly showing "listening".
        if let Some(c) = new_capture.as_ref() {
            c.set_buffering(true);
        }
    }
    st.capture.install(new_capture);
    if built && auto_live {
        // Re-arm the segmenter only after installing into the state:
        // reapply_bounds takes the capture lock and the live generation itself.
        auto::reapply_bounds(app);
    }
    built
}

pub fn ensure_capture(app: &AppHandle) -> bool {
    if app.state::<App>().capture.is_stalled() == Some(false) {
        return true;
    }
    rebuild_capture(app)
}

pub fn ensure_capture_or_err(app: &AppHandle) -> Result<(), AppError> {
    if ensure_capture(app) {
        Ok(())
    } else {
        Err(AppError::with_subject(
            ErrorCode::Permission,
            ERR_NO_SYSTEM_CAPTURE,
            crate::error::subject::SYSTEM_AUDIO_DEVICE,
        ))
    }
}

fn rebuild_capture_now(app: &AppHandle) {
    let never_built = !app.state::<App>().capture.is_present();
    let would_prompt = crate::permissions::AUDIO_REQUIRES_PERMISSION
        && !current_settings(app).audio_permission_requested;
    if never_built && would_prompt {
        return;
    }
    rebuild_capture(app);
}

/// The five side effects the pipeline cannot perform itself, bound to a live
/// `AppHandle`. Cheap to build (one handle clone), so it is built per call
/// rather than stored.
struct TauriRecordingHost(AppHandle);

impl RecordingHost for TauriRecordingHost {
    fn rebuild_capture(&self) {
        rebuild_capture_now(&self.0);
    }

    fn set_cancel_hotkey(&self, armed: bool) {
        let combo = hotkey::cancel_combo(&self.0);
        if armed {
            hotkey::register_cancel(&self.0, &combo);
        } else {
            hotkey::unregister_hotkey(&self.0, &combo);
        }
    }

    fn warm_up_llm(&self) {
        let llm_client = llm_provider(&self.0);
        tauri::async_runtime::spawn(async move { llm_client.warm_up().await });
    }

    fn watch_max_duration(&self, generation: u64) {
        spawn_max_duration_watchdog(self.0.clone(), generation);
    }

    fn copy_transcript(&self, text: &str) {
        use tauri_plugin_clipboard_manager::ClipboardExt;
        if current_settings(&self.0).copy_results_to_clipboard {
            let _ = self.0.clipboard().write_text(text.to_string());
        }
    }
}

pub fn on_ptt_pressed(app: &AppHandle) {
    let st = app.state::<App>();
    let stt = stt_engine(app);
    st.recording
        .on_ptt_pressed(app, &st.capture, &TauriRecordingHost(app.clone()), stt);
}

pub fn on_ptt_released(app: &AppHandle) {
    let st = app.state::<App>();
    let samples = st
        .recording
        .on_ptt_released(app, &st.capture, &TauriRecordingHost(app.clone()));
    if let Some(samples) = samples {
        spawn_transcription(app.clone(), samples);
    }
}

pub fn on_cancel(app: &AppHandle) {
    let st = app.state::<App>();
    st.recording
        .cancel(app, &st.capture, &TauriRecordingHost(app.clone()));
}

/// Тот же путь, что и у глобального хоткея, но вызываемый из окна: глобальная
/// регистрация может не встать, а отменять запись всё равно нужно.
#[tauri::command]
#[specta::specta]
pub fn cancel_recording(app: AppHandle) {
    on_cancel(&app);
}

fn spawn_transcription(app: AppHandle, samples: Vec<f32>) {
    tauri::async_runtime::spawn(async move {
        let stt = stt_engine(&app);
        let host = TauriRecordingHost(app.clone());
        let st = app.state::<App>();
        st.recording
            .finish_transcribe(&app, &st.capture, &host, stt, samples)
            .await;
    });
}

fn spawn_max_duration_watchdog(app: AppHandle, my_gen: u64) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(MAX_DURATION_WATCHDOG_INTERVAL).await;
            let st = app.state::<App>();
            let elapsed = st.capture.recording_secs();
            let host = TauriRecordingHost(app.clone());
            match st
                .recording
                .watchdog_tick(&app, &st.capture, &host, my_gen, elapsed)
            {
                WatchdogTick::KeepWatching => {}
                WatchdogTick::Stop => break,
                WatchdogTick::Transcribe(samples) => {
                    spawn_transcription(app.clone(), samples);
                    break;
                }
            }
        }
    });
}

#[tauri::command]
#[specta::specta]
pub async fn retry_transcription(app: AppHandle) {
    let stt = stt_engine(&app);
    let host = TauriRecordingHost(app.clone());
    let st = app.state::<App>();
    st.recording.retry(&app, &st.capture, &host, stt).await;
}

#[tauri::command]
#[specta::specta]
pub fn list_audio_output_devices() -> Vec<capture::AudioDeviceInfo> {
    capture::list_devices(capture::SourceKind::Output)
}
