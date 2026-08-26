use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::Mutex;

use tauri::{AppHandle, Manager};

use crate::app_state::{build_mic_capture, current_settings, stt_engine, App};
use crate::error::{AppError, ErrorCode};
use crate::{audio, capture, events, recording, settings, state};

const MAX_IN_FLIGHT_PER_SPEAKER: u32 = 2;

const ERR_RECORDER_BUSY: &str = "Идёт запись по клавише — дождитесь её окончания";
const ERR_NO_MICROPHONE: &str =
    "Нет доступа к микрофону — без него не отделить вашу речь от речи собеседника";
const ERR_MICROPHONE_UNAVAILABLE: &str =
    "Микрофон недоступен — проверьте доступ к микрофону и выбранное устройство";
const ERR_AUTO_MODE_ACTIVE: &str = "Включено автослушание — выключите его для записи по клавише";

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum Speaker {
    Interviewer,
    User,
}

#[derive(Default)]
pub struct AutoState {
    active: AtomicBool,
    // Between claiming `active` and storing the mic, start() does slow work
    // (opening the device takes hundreds of ms, up to 5 s on Windows), and
    // without a shared lock a parallel stop() could run IN FULL mid-start:
    // active=false while the mic is open and recording. The lock is held for
    // the whole body of start()/stop(); `active` stays atomic so is_active()
    // reads stay cheap.
    transition: Mutex<()>,
    // Start failure at HUD launch: the emit leaves before the webview manages
    // to subscribe, so the frontend pulls it with a command after mounting.
    last_error: Mutex<Option<AppError>>,
    generation: AtomicU64,
    seq: AtomicU32,
    interviewer_in_flight: AtomicU32,
    user_in_flight: AtomicU32,
}

impl AutoState {
    fn in_flight(&self, speaker: Speaker) -> &AtomicU32 {
        match speaker {
            Speaker::Interviewer => &self.interviewer_in_flight,
            Speaker::User => &self.user_in_flight,
        }
    }
}

pub fn device_changed(old: &settings::Settings, new: &settings::Settings) -> bool {
    old.auto_mic_device_uid != new.auto_mic_device_uid
}

pub fn bounds_changed(old: &settings::Settings, new: &settings::Settings) -> bool {
    old.auto_silence_ms != new.auto_silence_ms
        || old.auto_min_utterance_ms != new.auto_min_utterance_ms
        || old.auto_max_utterance_secs != new.auto_max_utterance_secs
}

pub fn is_active(app: &AppHandle) -> bool {
    app.state::<App>().auto.active.load(Ordering::Acquire)
}

pub fn recorder_busy_error() -> AppError {
    AppError::new(ErrorCode::Internal, ERR_AUTO_MODE_ACTIVE)
}

/// Микрофон открывается РОВНО ОДИН раз за старт, и спрашивать о доступе заранее
/// нельзя: единственный способ узнать статус — открыть устройство (`probe_microphone`),
/// после чего настоящее открытие идёт вторым по счёту и Core Audio отвечает
/// `kAudioHardwareIllegalOperationError` ('nope') — «сейчас так нельзя». Поэтому о
/// доступе судим по ошибке, а не до неё.
fn microphone_error(e: &capture::CaptureError) -> AppError {
    match e {
        capture::CaptureError::PermissionDenied => {
            AppError::new(ErrorCode::Permission, ERR_NO_MICROPHONE)
        }
        // Одним кодом Core Audio не отличает отказ TCC от «устройство занято или
        // не в том состоянии», так что текст называет обе причины, а исходную
        // ошибку оставляет хвостом: без неё диагностировать нечего.
        other => AppError::new(
            ErrorCode::Internal,
            format!("{ERR_MICROPHONE_UNAVAILABLE} ({other})"),
        ),
    }
}

fn segmenter_bounds(s: &settings::Settings) -> audio::SegmenterBounds {
    audio::SegmenterBounds {
        silence_ms: s.auto_silence_ms as usize,
        min_utterance_ms: s.auto_min_utterance_ms as usize,
        max_utterance_secs: s.auto_max_utterance_secs as usize,
    }
}

fn segment_sink(app: AppHandle, speaker: Speaker, generation: u64) -> capture::SegmentSink {
    Box::new(move |samples: Vec<f32>| {
        let st = app.state::<App>();
        if st.auto.generation.load(Ordering::Acquire) != generation {
            return;
        }
        if audio::is_silence(&samples) {
            return;
        }
        let in_flight = st.auto.in_flight(speaker);
        if in_flight.load(Ordering::Acquire) >= MAX_IN_FLIGHT_PER_SPEAKER {
            eprintln!("[auto] очередь распознавания заполнена, сегмент отброшен ({speaker:?})");
            return;
        }
        in_flight.fetch_add(1, Ordering::AcqRel);
        let seq = st.auto.seq.fetch_add(1, Ordering::AcqRel);
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            transcribe_segment(app, speaker, generation, seq, samples).await;
        });
    })
}

async fn transcribe_segment(
    app: AppHandle,
    speaker: Speaker,
    generation: u64,
    seq: u32,
    samples: Vec<f32>,
) {
    let engine = stt_engine(&app);
    let result = engine.transcribe(&samples).await;
    let st = app.state::<App>();
    // Saturating decrement: start()/stop() reset the counters to 0 while a task
    // is still in flight, and the paired fetch_sub wrapped the AtomicU32 to
    // u32::MAX — the queue ceiling read as forever "full" and that speaker's
    // turns were dropped until the next mode toggle.
    let _ = st
        .auto
        .in_flight(speaker)
        .fetch_update(Ordering::AcqRel, Ordering::Acquire, |v| v.checked_sub(1));
    // `SttEngine::transcribe` takes no cancellation token, so a stopped auto mode
    // discards its own late results by generation instead of cancelling them.
    if st.auto.generation.load(Ordering::Acquire) != generation {
        return;
    }
    match result {
        Ok(text) if !text.trim().is_empty() => events::auto_turn(
            &app,
            events::AutoTurnPayload {
                speaker,
                text: text.trim().to_string(),
                seq,
            },
        ),
        Ok(_) => {}
        Err(e) => events::auto_mode_error(&app, AppError::from(&e)),
    }
}

fn arm_segmenter(
    capture: &capture::AudioCapture,
    app: &AppHandle,
    settings: &settings::Settings,
    speaker: Speaker,
    generation: u64,
) {
    capture.start_segmenting(
        segmenter_bounds(settings),
        segment_sink(app.clone(), speaker, generation),
    );
}

pub fn record_start_error(app: &AppHandle, e: &AppError) {
    *app.state::<App>().auto.last_error.lock().unwrap() = Some(e.clone());
}

pub fn start(app: &AppHandle) -> Result<(), AppError> {
    let st = app.state::<App>();
    let _transition = st.auto.transition.lock().unwrap();
    // Claiming `active` up front, not at the end: launch-at-start and the hotkey can
    // race, and two starts that both got past a plain read would each build a mic
    // capture, the second silently dropping the first.
    if st.auto.active.swap(true, Ordering::AcqRel) {
        return Ok(());
    }
    let claimed = || st.auto.active.store(false, Ordering::Release);
    if *st.recorder.lock().unwrap() != state::RecorderState::Idle {
        claimed();
        return Err(AppError::new(ErrorCode::Internal, ERR_RECORDER_BUSY));
    }
    if crate::audio_check::is_active(app) {
        claimed();
        return Err(crate::audio_check::busy_error());
    }
    if let Err(e) = recording::ensure_capture_or_err(app) {
        claimed();
        return Err(e);
    }
    let settings = current_settings(app);
    let mic = match build_mic_capture(&settings) {
        Ok(mic) => mic,
        Err(e) => {
            claimed();
            return Err(microphone_error(&e));
        }
    };

    let generation = st.auto.generation.fetch_add(1, Ordering::AcqRel) + 1;
    st.auto.seq.store(0, Ordering::Release);
    st.auto.interviewer_in_flight.store(0, Ordering::Release);
    st.auto.user_in_flight.store(0, Ordering::Release);

    {
        let system = st.capture.lock().unwrap();
        let Some(system) = system.as_ref() else {
            drop(system);
            claimed();
            return Err(AppError::new(
                ErrorCode::Permission,
                recording::ERR_NO_SYSTEM_CAPTURE,
            ));
        };
        system.set_buffering(true);
        arm_segmenter(system, app, &settings, Speaker::Interviewer, generation);
    }

    mic.set_buffering(true);
    arm_segmenter(&mic, app, &settings, Speaker::User, generation);
    *st.mic_capture.lock().unwrap() = Some(mic);

    st.auto.last_error.lock().unwrap().take();
    events::auto_mode_changed(app, true);
    Ok(())
}

pub fn stop(app: &AppHandle) {
    let st = app.state::<App>();
    let _transition = st.auto.transition.lock().unwrap();
    if !st.auto.active.swap(false, Ordering::AcqRel) {
        return;
    }
    st.auto.generation.fetch_add(1, Ordering::AcqRel);
    let buffer_enabled = current_settings(app).buffer_enabled;
    if let Some(system) = st.capture.lock().unwrap().as_ref() {
        system.stop_segmenting();
        system.set_buffering(buffer_enabled);
    }
    *st.mic_capture.lock().unwrap() = None;
    st.auto.interviewer_in_flight.store(0, Ordering::Release);
    st.auto.user_in_flight.store(0, Ordering::Release);
    events::auto_mode_changed(app, false);
}

pub fn on_toggle(app: &AppHandle) {
    if is_active(app) {
        stop(app);
        return;
    }
    if let Err(e) = start(app) {
        events::auto_mode_error(app, e);
    }
}

// Re-arming the segmenters replaces them wholesale, so speech in flight at that
// moment is dropped. That is cheaper and less disruptive than rebuilding both
// audio devices, which is what changing a threshold used to cost.
pub fn reapply_bounds(app: &AppHandle) {
    let st = app.state::<App>();
    if !st.auto.active.load(Ordering::Acquire) {
        return;
    }
    let settings = current_settings(app);
    let generation = st.auto.generation.load(Ordering::Acquire);
    {
        let system = st.capture.lock().unwrap();
        if let Some(system) = system.as_ref() {
            arm_segmenter(system, app, &settings, Speaker::Interviewer, generation);
        }
    }
    {
        let mic = st.mic_capture.lock().unwrap();
        if let Some(mic) = mic.as_ref() {
            arm_segmenter(mic, app, &settings, Speaker::User, generation);
        }
    }
}

pub fn restart(app: &AppHandle) {
    if !is_active(app) {
        return;
    }
    stop(app);
    if let Err(e) = start(app) {
        events::auto_mode_error(app, e);
    }
}

#[tauri::command]
#[specta::specta]
pub fn start_auto_mode(app: AppHandle) -> Result<(), AppError> {
    start(&app)
}

#[tauri::command]
#[specta::specta]
pub fn stop_auto_mode(app: AppHandle) {
    stop(&app);
}

#[tauri::command]
#[specta::specta]
pub fn auto_mode_active(app: AppHandle) -> bool {
    is_active(&app)
}

/// Takes (and clears) a start error that happened before the webview
/// subscribed: `swap_to_main_window` starts the mode before the HUD manages to
/// mount, and the `auto-mode-error` event in that window goes nowhere.
#[tauri::command]
#[specta::specta]
pub fn take_auto_mode_error(app: AppHandle) -> Option<AppError> {
    app.state::<App>().auto.last_error.lock().unwrap().take()
}

#[tauri::command]
#[specta::specta]
pub fn list_audio_input_devices() -> Vec<capture::AudioDeviceInfo> {
    capture::list_devices(capture::SourceKind::Input)
}

#[cfg(test)]
mod tests;
