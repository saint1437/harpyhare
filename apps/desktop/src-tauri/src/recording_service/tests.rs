use super::*;

use std::sync::atomic::AtomicU64;

use crate::capture::{FakeCapture, FakeCaptureState};
use crate::events::RecordedEvents;

fn ok(text: &str) -> Result<String, stt::SttError> {
    Ok(text.to_string())
}

#[test]
fn a_completed_stream_delivers_its_text() {
    assert_eq!(
        stream_outcome(false, &ok("привет")),
        StreamOutcome::Deliver("привет".into())
    );
}

/// A broken stream is one whose body channel overflowed: the upload is missing
/// audio, so its answer must not be trusted even if it came back "successful".
#[test]
fn a_broken_stream_falls_back_even_on_a_successful_answer() {
    assert_eq!(
        stream_outcome(true, &ok("огрызок")),
        StreamOutcome::FallBackToBuffer
    );
    assert_eq!(
        stream_outcome(true, &Err(stt::SttError::BadApiKey)),
        StreamOutcome::FallBackToBuffer
    );
}

/// Retrying a rejected key over the slow path wastes ten seconds and hides the
/// reason — this is the one failure that is reported instead of retried.
#[test]
fn a_rejected_key_or_access_code_is_reported_not_retried() {
    assert_eq!(
        stream_outcome(false, &Err(stt::SttError::BadApiKey)),
        StreamOutcome::Report
    );
    assert_eq!(
        stream_outcome(false, &Err(stt::SttError::BadAccessCode("нет".into()))),
        StreamOutcome::Report
    );
}

#[test]
fn every_other_failure_degrades_to_the_classic_upload() {
    for error in [
        stt::SttError::Network("оборвалось".into()),
        stt::SttError::retryable(503),
        stt::SttError::Other("паника задачи".into()),
    ] {
        assert_eq!(
            stream_outcome(false, &Err(error)),
            StreamOutcome::FallBackToBuffer
        );
    }
}

// ---------------------------------------------------------------------------
// The fakes. `SttError` is not `Clone`, so the answers are an enum the fake
// turns into a fresh error each call.
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, PartialEq)]
enum Answer {
    Text(&'static str),
    BadKey,
    Network,
}

impl Answer {
    fn result(self) -> Result<String, stt::SttError> {
        match self {
            Answer::Text(t) => Ok(t.to_string()),
            Answer::BadKey => Err(stt::SttError::BadApiKey),
            Answer::Network => Err(stt::SttError::Network("оборвалось".into())),
        }
    }
}

struct FakeStt {
    classic: Answer,
    streaming: Answer,
    classic_calls: AtomicU64,
    stream_calls: AtomicU64,
}

impl FakeStt {
    fn new(classic: Answer, streaming: Answer) -> Arc<Self> {
        Arc::new(Self {
            classic,
            streaming,
            classic_calls: AtomicU64::new(0),
            stream_calls: AtomicU64::new(0),
        })
    }

    fn silent() -> Arc<Self> {
        Self::new(Answer::Text(""), Answer::Text(""))
    }
}

#[async_trait::async_trait]
impl stt::SttEngine for FakeStt {
    async fn transcribe(&self, _samples: &[f32]) -> Result<String, stt::SttError> {
        self.classic_calls.fetch_add(1, Ordering::AcqRel);
        self.classic.result()
    }

    async fn transcribe_stream(
        &self,
        mut chunks: stt::AudioChunkStream,
        _cancel: CancellationToken,
    ) -> Result<String, stt::SttError> {
        self.stream_calls.fetch_add(1, Ordering::AcqRel);
        // Draining is what makes the fake behave like the real upload: the body
        // ends when the sink (and with it the sender) is dropped.
        while chunks.next().await.is_some() {}
        self.streaming.result()
    }

    async fn warm_up(&self) {}
}

#[derive(Default)]
struct FakeHost {
    rebuilds: AtomicU64,
    cancel_hotkey: AtomicBool,
    warm_ups: AtomicU64,
    watchdogs: Mutex<Vec<u64>>,
    clipboard: Mutex<Vec<String>>,
}

impl RecordingHost for FakeHost {
    fn rebuild_capture(&self) {
        self.rebuilds.fetch_add(1, Ordering::AcqRel);
    }

    fn set_cancel_hotkey(&self, armed: bool) {
        self.cancel_hotkey.store(armed, Ordering::Release);
    }

    fn warm_up_llm(&self) {
        self.warm_ups.fetch_add(1, Ordering::AcqRel);
    }

    fn watch_max_duration(&self, generation: u64) {
        self.watchdogs.lock_safe().push(generation);
    }

    fn copy_transcript(&self, text: &str) {
        self.clipboard.lock_safe().push(text.to_string());
    }
}

/// Everything a test needs, wired together the way `App` wires it.
struct Rig {
    service: RecordingService,
    capture: CaptureService,
    bus: RecordedEvents,
    host: FakeHost,
    device: Arc<FakeCaptureState>,
}

/// Loud enough that `audio::is_silence` says no.
fn speech() -> Vec<f32> {
    vec![0.5; 1600]
}

impl Rig {
    fn new() -> Self {
        let (device, state) = FakeCapture::installable();
        let capture = CaptureService::default();
        capture.install(Some(device));
        state.set_recording_secs(1.0);
        state.set_samples(speech());
        Self {
            service: RecordingService::default(),
            capture,
            bus: RecordedEvents::default(),
            host: FakeHost::default(),
            device: state,
        }
    }

    /// No device at all — a machine where the tap could never be opened.
    fn without_capture() -> Self {
        let rig = Self::new();
        rig.capture.install(None);
        rig
    }

    fn press(&self, stt: Arc<dyn stt::SttEngine>) -> bool {
        self.service
            .on_ptt_pressed(&self.bus, &self.capture, &self.host, stt)
    }

    fn release(&self) -> Option<Vec<f32>> {
        self.service
            .on_ptt_released(&self.bus, &self.capture, &self.host)
    }

    fn events(&self) -> Vec<String> {
        self.bus.names()
    }

    fn count(&self, name: &str) -> usize {
        self.events().iter().filter(|n| *n == name).count()
    }
}

// --- the six guards of on_ptt_pressed ---------------------------------------

/// Guard 1. Key auto-repeat delivers a second press while the recording runs,
/// and that is not an error the user should ever see.
#[test]
fn a_key_repeat_while_recording_is_absorbed_without_a_word() {
    let rig = Rig::new();
    assert!(rig.press(FakeStt::silent()));
    let after_first = rig.events();

    assert!(!rig.press(FakeStt::silent()), "повтор не начинает вторую запись");
    assert_eq!(rig.events(), after_first, "повтор не должен ничего сообщать");
    assert_eq!(rig.service.state(), RecorderState::Recording);
}

/// Guard 2. Auto listening holds the same device, and the refusal has to name
/// the holder — "busy" without a subject sent people into the wrong settings.
#[test]
fn a_press_while_auto_listening_holds_the_capture_names_the_holder() {
    let rig = Rig::new();
    rig.capture.claim(CaptureMode::AutoListening).unwrap();

    assert!(!rig.press(FakeStt::silent()));
    assert_eq!(rig.events(), vec!["stt-error"]);
    assert_eq!(
        rig.bus.payload("stt-error").unwrap()["message"],
        serde_json::json!(CaptureMode::AutoListening.busy_error().message)
    );
    assert_eq!(
        rig.capture.mode(),
        CaptureMode::AutoListening,
        "отказ не отбирает захват у владельца"
    );
    assert_eq!(rig.service.state(), RecorderState::Idle);
}

/// Guard 3a. A capture that can no longer reopen its device is alive as an
/// object and dead as a stream; only a rebuild cures it.
#[test]
fn a_stalled_capture_is_rebuilt_before_the_recording_starts() {
    let rig = Rig::new();
    rig.device.stalled.store(true, Ordering::Release);

    assert!(rig.press(FakeStt::silent()));
    assert_eq!(rig.host.rebuilds.load(Ordering::Acquire), 1);
}

/// Guard 3b. A device change during a recording cannot rebuild on the spot, so
/// it leaves a flag — and the flag is spent exactly once.
#[test]
fn a_deferred_rebuild_is_spent_on_the_next_press_and_only_once() {
    let rig = Rig::new();
    rig.service.defer_capture_rebuild();

    assert!(rig.press(FakeStt::silent()));
    assert_eq!(rig.host.rebuilds.load(Ordering::Acquire), 1);

    rig.service.cancel(&rig.bus, &rig.capture, &rig.host);
    assert!(rig.press(FakeStt::silent()));
    assert_eq!(
        rig.host.rebuilds.load(Ordering::Acquire),
        1,
        "флаг одноразовый"
    );
}

/// Guard 4. No device at all is a different story from a stalled one, and the
/// press has to give the capture back before it reports.
#[test]
fn a_press_with_no_capture_reports_it_and_gives_the_mode_back() {
    let rig = Rig::without_capture();

    assert!(!rig.press(FakeStt::silent()));
    assert_eq!(rig.events(), vec!["stt-error"]);
    assert!(rig.capture.is_idle(), "режим захвата обязан вернуться");
    assert_eq!(rig.service.state(), RecorderState::Idle);
}

/// Guard 5. The FSM has the last word: a state that refuses `StartCapture`
/// rolls the claim back instead of recording into nowhere.
#[test]
fn a_fsm_that_refuses_to_start_gives_the_capture_back() {
    let rig = Rig::new();
    // Transcribing is the state the FSM answers PttPressed with `None` in.
    rig.device.set_recording_secs(1.0);
    assert!(rig.press(FakeStt::silent()));
    assert!(rig.release().is_some());
    assert_eq!(rig.service.state(), RecorderState::Transcribing);

    // The capture is still held by the transcription; free it so the press gets
    // past guard 2 and reaches the FSM.
    rig.capture.release(CaptureMode::Ptt);
    let before = rig.events().len();
    assert!(!rig.press(FakeStt::silent()));
    assert!(rig.capture.is_idle(), "отказ FSM возвращает захват");
    assert_eq!(rig.events().len(), before, "отказ FSM молчит");
}

/// Guard 6. A device that refuses to start rolls the press ALL the way back:
/// the stream is cancelled, the FSM returns to Idle and the mode is freed.
#[test]
fn a_device_that_refuses_to_start_rolls_the_press_all_the_way_back() {
    let rig = Rig::new();
    rig.device.start_fails.store(true, Ordering::Release);

    assert!(!rig.press(FakeStt::silent()));
    assert_eq!(rig.events(), vec!["stt-error"]);
    assert_eq!(rig.service.state(), RecorderState::Idle);
    assert!(rig.capture.is_idle());
    assert!(
        !rig.host.cancel_hotkey.load(Ordering::Acquire),
        "хоткей отмены не встаёт на несостоявшуюся запись"
    );
}

#[test]
fn a_successful_press_arms_the_recording_and_everything_around_it() {
    let rig = Rig::new();

    assert!(rig.press(FakeStt::silent()));
    assert_eq!(rig.service.state(), RecorderState::Recording);
    assert_eq!(rig.capture.mode(), CaptureMode::Ptt);
    assert!(rig.host.cancel_hotkey.load(Ordering::Acquire));
    assert_eq!(rig.host.warm_ups.load(Ordering::Acquire), 1);
    assert_eq!(rig.host.watchdogs.lock_safe().as_slice(), &[1]);
    assert_eq!(rig.service.generation(), 1);
    assert_eq!(rig.events(), vec!["state-changed"]);
    assert_eq!(
        rig.bus.payload("state-changed").unwrap(),
        serde_json::json!("recording")
    );
}

// --- the FSM through the service --------------------------------------------

#[test]
fn a_release_below_the_minimum_length_discards_the_recording() {
    let rig = Rig::new();
    rig.press(FakeStt::silent());
    rig.device
        .set_recording_secs(state::MIN_RECORDING_SECS / 2.0);

    assert_eq!(rig.release(), None);
    assert_eq!(rig.service.state(), RecorderState::Idle);
    assert!(rig.capture.is_idle());
    assert!(!rig.host.cancel_hotkey.load(Ordering::Acquire));
    assert_eq!(rig.count("stt-error"), 0, "слишком короткая запись — не ошибка");
}

#[test]
fn a_release_past_the_minimum_hands_the_samples_over() {
    let rig = Rig::new();
    rig.press(FakeStt::silent());
    rig.device.set_recording_secs(2.0);

    assert_eq!(rig.release(), Some(speech()));
    assert_eq!(rig.service.state(), RecorderState::Transcribing);
    assert!(rig.service.has_last_recording(), "«Повторить» нужен буфер");
    assert_eq!(
        rig.capture.mode(),
        CaptureMode::Ptt,
        "захват отпускают только в конце расшифровки"
    );
}

#[test]
fn a_release_of_silence_says_so_and_returns_to_idle() {
    let rig = Rig::new();
    rig.press(FakeStt::silent());
    rig.device.set_samples(vec![0.0; 1600]);

    assert_eq!(rig.release(), None);
    assert_eq!(rig.count("stt-error"), 1);
    assert_eq!(rig.service.state(), RecorderState::Idle);
    assert!(rig.capture.is_idle());
}

/// The device disappeared between the press and the release (unplugged, or a
/// rebuild landed): the length reads as zero, so the release is discarded the
/// way a too-short press is — silently, and back to Idle.
#[test]
fn a_release_with_the_capture_gone_is_discarded_not_transcribed() {
    let rig = Rig::new();
    rig.press(FakeStt::silent());
    rig.capture.install(None);

    assert_eq!(rig.release(), None);
    assert_eq!(rig.count("stt-error"), 0);
    assert_eq!(rig.service.state(), RecorderState::Idle);
    assert!(rig.capture.is_idle());
}

/// A stop that fails is a real failure and has to be named: the recording is
/// gone and the user needs to know why nothing appeared in the field.
#[test]
fn a_capture_that_fails_to_stop_reports_the_failure() {
    let rig = Rig::new();
    rig.press(FakeStt::silent());
    rig.device.set_recording_secs(2.0);
    rig.device.stop_fails.store(true, Ordering::Release);

    assert_eq!(rig.release(), None);
    assert_eq!(rig.count("stt-error"), 1);
    assert_eq!(rig.service.state(), RecorderState::Idle);
    assert!(rig.capture.is_idle());
}

/// The ceiling fires on a recording whose device has vanished: there is no
/// buffer to send, and that is the one case that says "нет аудио-буфера".
#[test]
fn the_ceiling_with_no_capture_left_reports_the_missing_buffer() {
    let rig = Rig::new();
    rig.press(FakeStt::silent());
    rig.capture.install(None);

    assert_eq!(tick(&rig, 1, state::MAX_RECORDING_SECS), WatchdogTick::Stop);
    assert_eq!(rig.count("stt-error"), 1);
    assert_eq!(rig.service.state(), RecorderState::Idle);
}

// --- cancellation ------------------------------------------------------------

#[test]
fn cancelling_a_live_recording_discards_it_and_frees_the_capture() {
    let rig = Rig::new();
    rig.press(FakeStt::silent());

    rig.service.cancel(&rig.bus, &rig.capture, &rig.host);
    assert_eq!(rig.service.state(), RecorderState::Idle);
    assert!(rig.capture.is_idle());
    assert!(!rig.host.cancel_hotkey.load(Ordering::Acquire));
    assert_eq!(rig.count("stt-error"), 0);
}

#[test]
fn cancelling_while_idle_does_nothing_at_all() {
    let rig = Rig::new();
    rig.service.cancel(&rig.bus, &rig.capture, &rig.host);
    assert!(rig.events().is_empty());
    assert_eq!(rig.service.state(), RecorderState::Idle);
}

/// Esc during the UPLOAD is deliberately not a cancellation: the audio is
/// already on its way and there is nothing left to discard, so the state must
/// not fall back to Idle behind the upload's back.
#[test]
fn cancelling_during_the_upload_leaves_the_transcription_alone() {
    let rig = Rig::new();
    rig.press(FakeStt::silent());
    rig.device.set_recording_secs(2.0);
    assert!(rig.release().is_some());
    let before = rig.events().len();

    rig.service.cancel(&rig.bus, &rig.capture, &rig.host);
    assert_eq!(rig.service.state(), RecorderState::Transcribing);
    assert_eq!(rig.capture.mode(), CaptureMode::Ptt);
    assert_eq!(rig.events().len(), before);
}

// --- the ten-minute ceiling --------------------------------------------------

fn tick(rig: &Rig, generation: u64, elapsed: f32) -> WatchdogTick {
    rig.service
        .watchdog_tick(&rig.bus, &rig.capture, &rig.host, generation, elapsed)
}

#[test]
fn the_watchdog_keeps_watching_below_the_ceiling() {
    let rig = Rig::new();
    rig.press(FakeStt::silent());
    assert_eq!(tick(&rig, 1, 1.0), WatchdogTick::KeepWatching);
}

/// A watchdog whose recording was superseded must die quietly, or it would
/// stop somebody else's recording at the ten-minute mark.
#[test]
fn a_watchdog_from_a_superseded_recording_stops() {
    let rig = Rig::new();
    rig.press(FakeStt::silent());
    assert_eq!(tick(&rig, 0, state::MAX_RECORDING_SECS + 1.0), WatchdogTick::Stop);
    assert_eq!(rig.service.state(), RecorderState::Recording);
}

#[test]
fn the_watchdog_stops_once_the_recording_has_ended() {
    let rig = Rig::new();
    rig.press(FakeStt::silent());
    rig.service.cancel(&rig.bus, &rig.capture, &rig.host);
    assert_eq!(tick(&rig, 1, state::MAX_RECORDING_SECS + 1.0), WatchdogTick::Stop);
}

#[test]
fn the_watchdog_transcribes_at_the_ceiling() {
    let rig = Rig::new();
    rig.press(FakeStt::silent());

    assert_eq!(
        tick(&rig, 1, state::MAX_RECORDING_SECS),
        WatchdogTick::Transcribe(speech())
    );
    assert_eq!(rig.service.state(), RecorderState::Transcribing);
    assert!(!rig.host.cancel_hotkey.load(Ordering::Acquire));
}

// --- the tail of a recording -------------------------------------------------

#[tokio::test]
async fn the_streaming_transcript_is_delivered_and_the_recorder_returns_to_idle() {
    let rig = Rig::new();
    let stt = FakeStt::new(Answer::Text("классика"), Answer::Text("поток"));
    rig.press(stt.clone());
    rig.device.set_recording_secs(2.0);
    let samples = rig.release().unwrap();

    rig.service
        .finish_transcribe(&rig.bus, &rig.capture, &rig.host, stt.clone(), samples)
        .await;

    assert_eq!(
        rig.bus.payload("transcript-ready").unwrap(),
        serde_json::json!("поток")
    );
    assert_eq!(rig.host.clipboard.lock_safe().as_slice(), &["поток".to_string()]);
    assert_eq!(rig.count("focus-prompt"), 1);
    assert_eq!(rig.service.state(), RecorderState::Idle);
    assert!(rig.capture.is_idle());
    assert_eq!(stt.classic_calls.load(Ordering::Acquire), 0, "фолбэк не нужен");
}

/// The whole point of "degrade, never break": a failed stream re-uploads the
/// buffer instead of losing the recording.
#[tokio::test]
async fn a_failed_stream_falls_back_to_the_classic_upload() {
    let rig = Rig::new();
    let stt = FakeStt::new(Answer::Text("классика"), Answer::Network);
    rig.press(stt.clone());
    rig.device.set_recording_secs(2.0);
    let samples = rig.release().unwrap();

    rig.service
        .finish_transcribe(&rig.bus, &rig.capture, &rig.host, stt.clone(), samples)
        .await;

    assert_eq!(stt.classic_calls.load(Ordering::Acquire), 1);
    assert_eq!(
        rig.bus.payload("transcript-ready").unwrap(),
        serde_json::json!("классика")
    );
}

/// A rejected key is the one failure that is reported rather than retried.
#[tokio::test]
async fn a_rejected_key_ends_the_recording_without_a_second_upload() {
    let rig = Rig::new();
    let stt = FakeStt::new(Answer::Text("классика"), Answer::BadKey);
    rig.press(stt.clone());
    rig.device.set_recording_secs(2.0);
    let samples = rig.release().unwrap();

    rig.service
        .finish_transcribe(&rig.bus, &rig.capture, &rig.host, stt.clone(), samples)
        .await;

    assert_eq!(stt.classic_calls.load(Ordering::Acquire), 0);
    assert_eq!(rig.count("stt-error"), 1);
    assert_eq!(rig.count("transcript-ready"), 0);
    assert_eq!(rig.service.state(), RecorderState::Idle);
}

/// The race the mode table exists for: the recorder lets the capture go, auto
/// listening takes it, and the upload comes back afterwards. Its
/// `finish_transcription` must not release a mode it no longer holds.
#[tokio::test]
async fn a_transcription_that_finishes_late_does_not_evict_auto_listening() {
    let rig = Rig::new();
    let stt = FakeStt::new(Answer::Text("классика"), Answer::Text("поток"));
    rig.press(stt.clone());
    rig.device.set_recording_secs(2.0);
    let samples = rig.release().unwrap();

    // The user switches auto listening on the moment push-to-talk lets go.
    rig.capture.release(CaptureMode::Ptt);
    rig.capture.claim(CaptureMode::AutoListening).unwrap();

    rig.service
        .finish_transcribe(&rig.bus, &rig.capture, &rig.host, stt, samples)
        .await;

    assert_eq!(
        rig.capture.mode(),
        CaptureMode::AutoListening,
        "опоздавшая расшифровка не отбирает захват у автослушания"
    );
    assert_eq!(rig.service.state(), RecorderState::Idle);
}

// --- retry -------------------------------------------------------------------

#[tokio::test]
async fn retry_without_a_recording_does_nothing() {
    let rig = Rig::new();
    let stt = FakeStt::new(Answer::Text("ещё раз"), Answer::Text(""));

    rig.service
        .retry(&rig.bus, &rig.capture, &rig.host, stt.clone())
        .await;

    assert!(rig.events().is_empty());
    assert_eq!(stt.classic_calls.load(Ordering::Acquire), 0);
}

#[tokio::test]
async fn retry_while_the_recorder_is_busy_is_refused() {
    let rig = Rig::new();
    let stt = FakeStt::new(Answer::Text("ещё раз"), Answer::Text("поток"));
    rig.press(stt.clone());
    rig.device.set_recording_secs(2.0);
    rig.release().unwrap();
    let before = rig.events().len();

    rig.service
        .retry(&rig.bus, &rig.capture, &rig.host, stt.clone())
        .await;

    assert_eq!(rig.events().len(), before);
    assert_eq!(stt.classic_calls.load(Ordering::Acquire), 0);
    assert_eq!(rig.service.state(), RecorderState::Transcribing);
}

#[tokio::test]
async fn retry_re_uploads_the_last_recording() {
    let rig = Rig::new();
    let stt = FakeStt::new(Answer::Text("ещё раз"), Answer::Network);
    rig.press(stt.clone());
    rig.device.set_recording_secs(2.0);
    let samples = rig.release().unwrap();
    rig.service
        .finish_transcribe(&rig.bus, &rig.capture, &rig.host, stt.clone(), samples)
        .await;
    let uploads = stt.classic_calls.load(Ordering::Acquire);

    rig.service
        .retry(&rig.bus, &rig.capture, &rig.host, stt.clone())
        .await;

    assert_eq!(stt.classic_calls.load(Ordering::Acquire), uploads + 1);
    assert_eq!(rig.count("transcript-ready"), 2);
    assert_eq!(rig.service.state(), RecorderState::Idle);
}
