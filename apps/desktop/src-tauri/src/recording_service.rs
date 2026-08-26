//! The push-to-talk pipeline, with no idea that Tauri exists.
//!
//! `recording.rs` used to be four hundred lines that all began with
//! `app.state::<App>()`: the recorder FSM, the last recording, the streaming
//! transcription slot and the recording generation were four separate fields of
//! a god-state, and every step of the pipeline reached into them through a live
//! `AppHandle`. The six guards `on_ptt_pressed` runs before it starts a
//! recording — the ones that decide whether the key press becomes a recording
//! at all — could not be tested at all, because reaching them meant constructing
//! a Tauri application.
//!
//! Here the four fields are one owner and every collaborator is a port:
//! `EventBus` for what the pipeline reports, `CaptureService` for the device,
//! `SttEngine` for recognition and `RecordingHost` for the handful of things
//! only the host application can do (rebuild a capture, arm a global hotkey,
//! warm the LLM connection up, schedule the length watchdog, reach the
//! clipboard). `recording.rs` is now the command layer that binds those ports to
//! the real `AppHandle`.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use futures_util::StreamExt;
use tokio_util::sync::CancellationToken;

use crate::capture_service::{CaptureMode, CaptureService};
use crate::error::{AppError, ErrorCode};
use crate::events::{self, EventBus};
use crate::state::{self, RecorderState};
use crate::sync::MutexExt;
use crate::{audio, capture, stt};

const ERR_NO_AUDIO_BUFFER: &str = "нет аудио-буфера";
const STT_STREAM_CHANNEL_CAPACITY: usize = 256;

type SttBodyChunk = Result<Vec<u8>, std::io::Error>;

/// The streaming transcription that is running while the key is held: the task
/// uploading the body, its cancellation token, and the flag the chunk sink
/// raises when the body channel overflowed and the upload is missing audio.
pub struct SttStream {
    handle: tauri::async_runtime::JoinHandle<Result<String, stt::SttError>>,
    cancel: CancellationToken,
    broken: Arc<AtomicBool>,
}

/// What the pipeline needs from the host application.
///
/// Five things, and every one of them is a side effect on something outside the
/// recording domain — which is exactly why they are a port and not methods on
/// the service.
pub trait RecordingHost {
    /// Rebuilds the system capture after a device change or a stall. The policy
    /// that comes with it (never prompt for a permission that has never been
    /// asked for) lives in the implementation.
    fn rebuild_capture(&self);
    /// Arms or disarms the cancel hotkey for the duration of a recording.
    fn set_cancel_hotkey(&self, armed: bool);
    /// Opens the LLM connection while the user is still speaking.
    fn warm_up_llm(&self);
    /// Schedules the maximum-duration watchdog for this recording generation.
    fn watch_max_duration(&self, generation: u64);
    /// Puts a finished transcript on the clipboard, if the setting asks for it.
    fn copy_transcript(&self, text: &str);
}

/// What to do with the result of the streaming transcription.
///
/// Streaming is an optimisation on top of a working classic upload, and the
/// rule is "degrade, never break" — except for a rejected key, where retrying
/// the same key over the slow path only wastes the user's time and hides the
/// real reason.
#[derive(Debug, PartialEq)]
pub enum StreamOutcome {
    /// The stream produced the transcript — use it.
    Deliver(String),
    /// A refusal a second attempt cannot fix: report it and stop.
    Report,
    /// Anything else: fall back to uploading the accumulated buffer.
    FallBackToBuffer,
}

pub fn stream_outcome(broken: bool, result: &Result<String, stt::SttError>) -> StreamOutcome {
    if broken {
        return StreamOutcome::FallBackToBuffer;
    }
    match result {
        Ok(text) => StreamOutcome::Deliver(text.clone()),
        Err(stt::SttError::BadApiKey | stt::SttError::BadAccessCode(_)) => StreamOutcome::Report,
        Err(_) => StreamOutcome::FallBackToBuffer,
    }
}

/// One tick of the maximum-duration watchdog.
#[derive(Debug, PartialEq)]
pub enum WatchdogTick {
    /// The recording this watchdog was watching is over — stop looping.
    Stop,
    KeepWatching,
    /// The ceiling was reached and the capture has been stopped: transcribe.
    Transcribe(Vec<f32>),
}

/// Owns the recorder FSM, the last recording, the streaming transcription slot
/// and the recording generation. Lock order inside: `recorder` is never held
/// across `stt_stream` or `last_recording`, and none of the three is held while
/// the capture is being stopped (that waits on a condvar for up to five
/// seconds — see `CaptureService::stop_taken`).
#[derive(Default)]
pub struct RecordingService {
    recorder: Mutex<RecorderState>,
    last_recording: Mutex<Option<Vec<f32>>>,
    stt_stream: Mutex<Option<SttStream>>,
    /// Bumped on every started recording. The watchdog carries its own value and
    /// stops the moment it stops being the current one.
    generation: AtomicU64,
    /// The device changed while the recorder was busy: rebuilding now would tear
    /// down a live session, so the next key press does it instead.
    rebuild_pending: AtomicBool,
}

impl RecordingService {
    pub fn state(&self) -> RecorderState {
        *self.recorder.lock_safe()
    }

    pub fn is_idle(&self) -> bool {
        self.state() == RecorderState::Idle
    }

    pub fn generation(&self) -> u64 {
        self.generation.load(Ordering::SeqCst)
    }

    /// The device changed while a recording was running. Rebuilding is deferred
    /// to the next press rather than dropped: the flag is the whole memory of it.
    pub fn defer_capture_rebuild(&self) {
        self.rebuild_pending.store(true, Ordering::SeqCst);
    }

    pub fn has_last_recording(&self) -> bool {
        self.last_recording.lock_safe().is_some()
    }

    /// The six guards a key press has to pass before it becomes a recording, in
    /// order: the recorder must be idle (key auto-repeat lands here), the
    /// capture must be free, a stale device is rebuilt first, there has to BE a
    /// device, the FSM must agree, and the device must actually start.
    ///
    /// Returns whether a recording started. Every refusal that the user could
    /// not have predicted reports itself through `stt-error`; a key repeat does
    /// not, because it is not an error the user should see.
    pub fn on_ptt_pressed<B: EventBus>(
        &self,
        bus: &B,
        capture: &CaptureService,
        host: &impl RecordingHost,
        stt: Arc<dyn stt::SttEngine>,
    ) -> bool {
        // Asking before claiming keeps the repeat silent AND keeps the claim
        // below a genuine Idle → Ptt transition, so its rollback is always ours.
        if !self.is_idle() {
            return false;
        }
        // One question instead of the two `is_active` checks that used to stand
        // here: the capture mode already knows whether auto listening or the
        // audio check is holding the device, and it answers with that holder's
        // own wording. Claiming BEFORE the rebuild also keeps the rebuild out of
        // a live auto session.
        if let Err(e) = capture.claim(CaptureMode::Ptt) {
            events::stt_error(bus, e);
            return false;
        }
        if self.rebuild_pending.swap(false, Ordering::SeqCst) || capture.is_stalled() == Some(true) {
            host.rebuild_capture();
        }
        if !capture.is_present() {
            capture.release(CaptureMode::Ptt);
            events::stt_error(bus, capture::no_capture_error());
            return false;
        }
        let action = self.recorder.lock_safe().on(state::Event::PttPressed);
        if action != state::Action::StartCapture {
            capture.release(CaptureMode::Ptt);
            return false;
        }
        let sink = self.start_streaming_transcription(stt);
        if let Some(Err(e)) = capture.start(Some(sink)) {
            self.cancel_stt_stream();
            events::stt_error(bus, AppError::from(&e));
            self.recorder.lock_safe().on(state::Event::Cancel);
            capture.release(CaptureMode::Ptt);
            return false;
        }
        let generation = self.generation.fetch_add(1, Ordering::SeqCst) + 1;
        host.set_cancel_hotkey(true);
        events::state_changed(bus, RecorderState::Recording);
        host.watch_max_duration(generation);
        host.warm_up_llm();
        true
    }

    /// The synchronous half of a release. `Some(samples)` = go transcribe them.
    pub fn on_ptt_released<B: EventBus>(
        &self,
        bus: &B,
        capture: &CaptureService,
        host: &impl RecordingHost,
    ) -> Option<Vec<f32>> {
        let duration_secs = capture.recording_secs();
        let action = self
            .recorder
            .lock_safe()
            .on(state::Event::PttReleased { duration_secs });
        host.set_cancel_hotkey(false);
        self.finish_recording(bus, capture, action)
    }

    /// Esc, or the window's cancel command. Cancelling anything other than a
    /// live recording is deliberately a no-op.
    pub fn cancel<B: EventBus>(
        &self,
        bus: &B,
        capture: &CaptureService,
        host: &impl RecordingHost,
    ) {
        let action = self.recorder.lock_safe().on(state::Event::Cancel);
        if action != state::Action::Discard {
            return;
        }
        self.discard_recording(bus, capture);
        host.set_cancel_hotkey(false);
    }

    /// One tick of the ten-minute ceiling. `elapsed_secs` is read from the
    /// capture by the caller so the ceiling itself stays testable.
    pub fn watchdog_tick<B: EventBus>(
        &self,
        bus: &B,
        capture: &CaptureService,
        host: &impl RecordingHost,
        generation: u64,
        elapsed_secs: f32,
    ) -> WatchdogTick {
        if self.generation() != generation || self.state() != RecorderState::Recording {
            return WatchdogTick::Stop;
        }
        if elapsed_secs < state::MAX_RECORDING_SECS {
            return WatchdogTick::KeepWatching;
        }
        let action = self
            .recorder
            .lock_safe()
            .on(state::Event::MaxDurationReached);
        host.set_cancel_hotkey(false);
        match self.finish_recording(bus, capture, action) {
            Some(samples) => WatchdogTick::Transcribe(samples),
            None => WatchdogTick::Stop,
        }
    }

    /// The tail of a push-to-talk recording: prefer the streaming transcript,
    /// fall back to uploading the accumulated buffer, report a rejected key.
    pub async fn finish_transcribe<B: EventBus>(
        &self,
        bus: &B,
        capture: &CaptureService,
        host: &impl RecordingHost,
        stt: Arc<dyn stt::SttEngine>,
        samples: Vec<f32>,
    ) {
        let t = std::time::Instant::now();
        let stream = self.stt_stream.lock_safe().take();
        if let Some(s) = stream {
            let broken = s.broken.load(Ordering::Relaxed);
            if broken {
                eprintln!("[perf] stt stream неполон — фолбэк на классическую загрузку");
                s.cancel.cancel();
            }
            // A joined task that panicked is not a transcription failure with a
            // message of its own, so it is folded into the same fallback.
            let joined = match s.handle.await {
                Ok(result) => result,
                Err(e) => Err(stt::SttError::Other(e.to_string())),
            };
            match stream_outcome(broken, &joined) {
                StreamOutcome::Deliver(text) => {
                    eprintln!("[perf] stop → transcript (stream) {:?}", t.elapsed());
                    return self.deliver_transcript(bus, capture, host, text);
                }
                StreamOutcome::Report => {
                    let e = joined.unwrap_err();
                    return self.finish_transcription(bus, capture, Err(AppError::from(&e)));
                }
                StreamOutcome::FallBackToBuffer => {
                    if let Err(e) = &joined {
                        eprintln!("[perf] stt stream не удался ({e}) — фолбэк на классику");
                    }
                }
            }
        }
        self.transcribe_and_emit(bus, capture, host, stt, samples).await;
    }

    /// "Retry" on a failed transcription. The samples are still in memory, so
    /// this never touches the capture — but it does have to claim the recorder,
    /// or a retry pressed while a new recording is running would report its
    /// result into the middle of that one.
    pub async fn retry<B: EventBus>(
        &self,
        bus: &B,
        capture: &CaptureService,
        host: &impl RecordingHost,
        stt: Arc<dyn stt::SttEngine>,
    ) {
        let Some(samples) = self.last_recording.lock_safe().clone() else {
            return;
        };
        {
            let mut recorder = self.recorder.lock_safe();
            if *recorder != RecorderState::Idle {
                return;
            }
            *recorder = RecorderState::Transcribing;
        }
        events::state_changed(bus, RecorderState::Transcribing);
        self.transcribe_and_emit(bus, capture, host, stt, samples)
            .await;
    }

    fn finish_recording<B: EventBus>(
        &self,
        bus: &B,
        capture: &CaptureService,
        action: state::Action,
    ) -> Option<Vec<f32>> {
        match action {
            state::Action::Discard => {
                self.discard_recording(bus, capture);
                None
            }
            state::Action::Transcribe => self.begin_transcription(bus, capture),
            _ => None,
        }
    }

    fn discard_recording<B: EventBus>(&self, bus: &B, capture: &CaptureService) {
        self.cancel_stt_stream();
        let _ = capture.stop_taken();
        capture.release(CaptureMode::Ptt);
        events::state_changed(bus, RecorderState::Idle);
    }

    fn begin_transcription<B: EventBus>(
        &self,
        bus: &B,
        capture: &CaptureService,
    ) -> Option<Vec<f32>> {
        events::state_changed(bus, RecorderState::Transcribing);
        let s16k = match stop_capture_for_transcription(capture) {
            Ok(v) => v,
            Err(msg) => {
                self.cancel_stt_stream();
                self.finish_transcription(bus, capture, Err(msg));
                return None;
            }
        };
        if audio::is_silence(&s16k) {
            self.cancel_stt_stream();
            self.finish_transcription(bus, capture, Err(capture::silence_error()));
            return None;
        }
        *self.last_recording.lock_safe() = Some(s16k.clone());
        Some(s16k)
    }

    async fn transcribe_and_emit<B: EventBus>(
        &self,
        bus: &B,
        capture: &CaptureService,
        host: &impl RecordingHost,
        stt: Arc<dyn stt::SttEngine>,
        samples: Vec<f32>,
    ) {
        let t = std::time::Instant::now();
        let res = stt.transcribe(&samples).await;
        eprintln!("[perf] stt transcribe (wav+upload+inference) {:?}", t.elapsed());
        match res {
            Ok(text) => self.deliver_transcript(bus, capture, host, text),
            Err(e) => self.finish_transcription(bus, capture, Err(AppError::from(&e))),
        }
    }

    fn deliver_transcript<B: EventBus>(
        &self,
        bus: &B,
        capture: &CaptureService,
        host: &impl RecordingHost,
        text: String,
    ) {
        host.copy_transcript(&text);
        events::transcript_ready(bus, text);
        events::focus_prompt(bus);
        self.finish_transcription(bus, capture, Ok(()));
    }

    /// The single funnel back to Idle, and therefore the single place the
    /// push-to-talk hold on the capture is given back.
    fn finish_transcription<B: EventBus>(
        &self,
        bus: &B,
        capture: &CaptureService,
        result: Result<(), AppError>,
    ) {
        self.recorder
            .lock_safe()
            .on(state::Event::TranscriptionFinished);
        capture.release(CaptureMode::Ptt);
        if let Err(err) = result {
            events::stt_error(bus, err);
        }
        events::state_changed(bus, RecorderState::Idle);
    }

    /// Opens the request to the STT engine at the moment the key goes down and
    /// hands back the sink the capture feeds 16 kHz chunks into. Cancelling the
    /// stream the new one replaces is what keeps a superseded upload from
    /// finishing on somebody else's recording.
    pub fn cancel_stt_stream(&self) {
        if let Some(s) = self.stt_stream.lock_safe().take() {
            s.cancel.cancel();
        }
    }

    fn start_streaming_transcription(&self, stt: Arc<dyn stt::SttEngine>) -> capture::ChunkSink {
        let cancel = CancellationToken::new();
        let broken = Arc::new(AtomicBool::new(false));
        let (tx, rx) = tokio::sync::mpsc::channel::<SttBodyChunk>(STT_STREAM_CHANNEL_CAPACITY);
        let header: SttBodyChunk = Ok(audio::wav_header_streaming().to_vec());
        let body_stream: stt::AudioChunkStream = Box::pin(
            futures_util::stream::iter([header]).chain(futures_util::stream::unfold(
                rx,
                |mut rx| async move { rx.recv().await.map(|item| (item, rx)) },
            )),
        );
        let handle = {
            let cancel = cancel.clone();
            tauri::async_runtime::spawn(async move { stt.transcribe_stream(body_stream, cancel).await })
        };
        if let Some(old) = self.stt_stream.lock_safe().replace(SttStream {
            handle,
            cancel,
            broken: Arc::clone(&broken),
        }) {
            old.cancel.cancel();
        }
        Box::new(move |samples: &[f32]| {
            if broken.load(Ordering::Relaxed) {
                return;
            }
            if tx.try_send(Ok(audio::f32_to_i16le_bytes(samples))).is_err() {
                broken.store(true, Ordering::Relaxed);
            }
        })
    }
}

fn stop_capture_for_transcription(capture: &CaptureService) -> Result<Vec<f32>, AppError> {
    let t = std::time::Instant::now();
    let Some(stopped) = capture.stop_taken() else {
        return Err(AppError::new(ErrorCode::Internal, ERR_NO_AUDIO_BUFFER));
    };
    let s16k = stopped.map_err(|e| AppError::from(&e))?;
    eprintln!(
        "[perf] stop → 16k моно готов ({:.1}s audio) за {:?}",
        s16k.len() as f32 / audio::TARGET_SAMPLE_RATE as f32,
        t.elapsed()
    );
    Ok(s16k)
}

#[cfg(test)]
mod tests;
