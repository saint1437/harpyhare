use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager};

use crate::app_state::{build_mic_capture, current_settings, stt_engine, App};
use crate::error::{AppError, ErrorCode};
use crate::{audio, capture, events, recording, settings, state};

const MAX_IN_FLIGHT_PER_SPEAKER: u32 = 2;

const ERR_RECORDER_BUSY: &str = "Идёт запись по клавише — дождитесь её окончания";
const ERR_NO_SYSTEM_CAPTURE: &str = "Захват системного звука недоступен";
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

fn now_ms() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as f64)
        .unwrap_or_default()
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
        let at_ms = now_ms();
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            transcribe_segment(app, speaker, generation, seq, at_ms, samples).await;
        });
    })
}

async fn transcribe_segment(
    app: AppHandle,
    speaker: Speaker,
    generation: u64,
    seq: u32,
    at_ms: f64,
    samples: Vec<f32>,
) {
    let engine = stt_engine(&app);
    let result = engine.transcribe(&samples).await;
    let st = app.state::<App>();
    st.auto.in_flight(speaker).fetch_sub(1, Ordering::AcqRel);
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
                at_ms,
            },
        ),
        Ok(_) => {}
        Err(e) => events::auto_mode_error(&app, AppError::from(&e)),
    }
}

pub fn start(app: &AppHandle) -> Result<(), AppError> {
    let st = app.state::<App>();
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
    if !recording::ensure_capture(app) {
        claimed();
        return Err(AppError::new(ErrorCode::Permission, ERR_NO_SYSTEM_CAPTURE));
    }
    let settings = current_settings(app);
    let mic = match build_mic_capture(&settings) {
        Ok(mic) => mic,
        Err(e) => {
            claimed();
            return Err(AppError::from(&e));
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
            return Err(AppError::new(ErrorCode::Permission, ERR_NO_SYSTEM_CAPTURE));
        };
        system.set_buffering(true);
        system.start_segmenting(
            segmenter_bounds(&settings),
            segment_sink(app.clone(), Speaker::Interviewer, generation),
        );
    }

    mic.set_buffering(true);
    mic.start_segmenting(
        segmenter_bounds(&settings),
        segment_sink(app.clone(), Speaker::User, generation),
    );
    *st.mic_capture.lock().unwrap() = Some(mic);

    events::auto_mode_changed(app, true);
    Ok(())
}

pub fn stop(app: &AppHandle) {
    let st = app.state::<App>();
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
            system.start_segmenting(
                segmenter_bounds(&settings),
                segment_sink(app.clone(), Speaker::Interviewer, generation),
            );
        }
    }
    {
        let mic = st.mic_capture.lock().unwrap();
        if let Some(mic) = mic.as_ref() {
            mic.start_segmenting(
                segmenter_bounds(&settings),
                segment_sink(app.clone(), Speaker::User, generation),
            );
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

#[tauri::command]
#[specta::specta]
pub fn list_audio_input_devices() -> Vec<capture::AudioDeviceInfo> {
    capture::list_devices(capture::SourceKind::Input)
}

#[cfg(test)]
mod tests;
