use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::Mutex;

use tauri::{AppHandle, Manager};

use crate::app_state::{build_mic_capture, current_settings, stt_engine, App};
use crate::capture_service::CaptureMode;
use crate::error::{AppError, ErrorCode};
use crate::{audio, capture, events, recording, settings};
use crate::sync::MutexExt;

const MAX_IN_FLIGHT_PER_SPEAKER: u32 = 2;

const ERR_NO_MICROPHONE: &str =
    "Нет доступа к микрофону — без него не отделить вашу речь от речи собеседника";
const ERR_MICROPHONE_UNAVAILABLE: &str =
    "Микрофон недоступен — проверьте доступ к микрофону и выбранное устройство";

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum Speaker {
    Interviewer,
    User,
}

/// Auto mode's whole state: whether it is running, the transition lock, the
/// microphone it opened, the generation that invalidates late results and the
/// per-speaker in-flight counters.
#[derive(Default)]
pub struct AutoService {
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
    /// The microphone auto mode opened. It belongs here and not in `App`: it is
    /// created by `start`, dropped by `stop`, and nothing else may touch it.
    mic: Mutex<Option<capture::AudioCapture>>,
}

impl AutoService {
    fn in_flight(&self, speaker: Speaker) -> &AtomicU32 {
        match speaker {
            Speaker::Interviewer => &self.interviewer_in_flight,
            Speaker::User => &self.user_in_flight,
        }
    }

    /// A live microphone is proof the permission was granted — the only proof
    /// there is, since the status can only be learned by opening the device.
    pub fn has_microphone(&self) -> bool {
        self.mic.lock_safe().is_some()
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

/// Микрофон открывается РОВНО ОДИН раз за старт, и спрашивать о доступе заранее
/// нельзя: единственный способ узнать статус — открыть устройство (`probe_microphone`),
/// после чего настоящее открытие идёт вторым по счёту и Core Audio отвечает
/// `kAudioHardwareIllegalOperationError` ('nope') — «сейчас так нельзя». Поэтому о
/// доступе судим по ошибке, а не до неё.
fn microphone_error(e: &capture::CaptureError) -> AppError {
    match e {
        capture::CaptureError::PermissionDenied => AppError::with_subject(
            ErrorCode::Permission,
            ERR_NO_MICROPHONE,
            crate::error::subject::MICROPHONE,
        ),
        // Одним кодом Core Audio не отличает отказ TCC от «устройство занято или
        // не в том состоянии», так что текст называет обе причины, а исходную
        // ошибку оставляет хвостом: без неё диагностировать нечего.
        other => AppError::with_params(
            ErrorCode::Internal,
            format!("{ERR_MICROPHONE_UNAVAILABLE} ({other})"),
            crate::error::params_of([
                (crate::error::param::SUBJECT, crate::error::subject::MICROPHONE_UNAVAILABLE.into()),
                (crate::error::param::DETAILS, other.to_string()),
            ]),
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
    capture: &dyn capture::CaptureDevice,
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
    *app.state::<App>().auto.last_error.lock_safe() = Some(e.clone());
}

/// Everything that has to be true before auto mode may take the capture, in one
/// place. It used to be nine early returns in the body of `start`, and every one
/// of them was individually responsible for rolling `active` back — the kind of
/// duty that is correct until the tenth is added.
///
/// The mutual exclusion itself is no longer asked here: `CaptureService::claim`
/// owns the whole table, so "PTT is recording" and "the audio check is running"
/// are one question with one answer.
fn can_start(app: &AppHandle) -> Result<(), AppError> {
    app.state::<App>().capture.claim(CaptureMode::AutoListening)?;
    recording::ensure_capture_or_err(app)
}

pub fn start(app: &AppHandle) -> Result<(), AppError> {
    let st = app.state::<App>();
    let _transition = st.auto.transition.lock_safe();
    // Claiming `active` up front, not at the end: launch-at-start and the hotkey can
    // race, and two starts that both got past a plain read would each build a mic
    // capture, the second silently dropping the first.
    if st.auto.active.swap(true, Ordering::AcqRel) {
        return Ok(());
    }
    let release_claim = || {
        st.auto.active.store(false, Ordering::Release);
        st.capture.release(CaptureMode::AutoListening);
    };
    if let Err(e) = can_start(app) {
        release_claim();
        return Err(e);
    }
    let settings = current_settings(app);
    let mic = match build_mic_capture(&settings) {
        Ok(mic) => mic,
        Err(e) => {
            release_claim();
            return Err(microphone_error(&e));
        }
    };

    let generation = st.auto.generation.fetch_add(1, Ordering::AcqRel) + 1;
    st.auto.seq.store(0, Ordering::Release);
    st.auto.interviewer_in_flight.store(0, Ordering::Release);
    st.auto.user_in_flight.store(0, Ordering::Release);

    let armed = st.capture.with(|system| {
        system.set_buffering(true);
        arm_segmenter(system, app, &settings, Speaker::Interviewer, generation);
    });
    if armed.is_none() {
        release_claim();
        return Err(AppError::with_subject(
            ErrorCode::Permission,
            recording::ERR_NO_SYSTEM_CAPTURE,
            crate::error::subject::SYSTEM_AUDIO_DEVICE,
        ));
    }

    mic.set_buffering(true);
    arm_segmenter(&mic, app, &settings, Speaker::User, generation);
    *st.auto.mic.lock_safe() = Some(mic);

    st.auto.last_error.lock_safe().take();
    events::auto_mode_changed(app, true);
    Ok(())
}

pub fn stop(app: &AppHandle) {
    let st = app.state::<App>();
    let _transition = st.auto.transition.lock_safe();
    if !st.auto.active.swap(false, Ordering::AcqRel) {
        return;
    }
    st.auto.generation.fetch_add(1, Ordering::AcqRel);
    let buffer_enabled = current_settings(app).buffer_enabled;
    st.capture.with(|system| {
        system.stop_segmenting();
        system.set_buffering(buffer_enabled);
    });
    *st.auto.mic.lock_safe() = None;
    st.auto.interviewer_in_flight.store(0, Ordering::Release);
    st.auto.user_in_flight.store(0, Ordering::Release);
    st.capture.release(CaptureMode::AutoListening);
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
    st.capture.with(|system| {
        arm_segmenter(system, app, &settings, Speaker::Interviewer, generation);
    });
    {
        let mic = st.auto.mic.lock_safe();
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
    app.state::<App>().auto.last_error.lock_safe().take()
}

#[tauri::command]
#[specta::specta]
pub fn list_audio_input_devices() -> Vec<capture::AudioDeviceInfo> {
    capture::list_devices(capture::SourceKind::Input)
}

#[cfg(test)]
mod tests;
