use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::time::Duration;

use ringbuf::traits::{Consumer, Producer, Split};
use ringbuf::{HeapCons, HeapProd, HeapRb};

use crate::audio;

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;

/// The contract a platform has to satisfy, stated instead of implied.
///
/// The three split modules (`capture`, `platform`, `screenshot`) used to be
/// wired up by a naming convention alone: `use macos as backend`, and the
/// compiler only noticed a missing function where the facade happened to call
/// it. A backend that forgot one, or drifted in a signature, was a build error
/// in the wrong file at best and a `#[cfg]`-shaped hole at worst — and there was
/// nothing for a third platform to be written against. With the trait, "the
/// Linux backend is incomplete" is one error naming the missing item.
///
/// The two-phase `open`/`start` split is part of the contract, not an accident:
/// `open` reports the stream format FIRST, because the ring's size and the
/// fields of `Shared` are derived from it and cannot exist before it.
pub(crate) trait CaptureBackend {
    /// The opened, not yet running, source.
    type Source;
    /// Silences the capture in `Drop`. `Send` because `AudioCapture` holds it
    /// and travels between threads under a mutex.
    type Running: Send;

    fn open(
        kind: SourceKind,
        device_uid: Option<&str>,
    ) -> Result<(Self::Source, StreamSpec), CaptureError>;
    fn start(source: Self::Source, ctx: Box<CallbackCtx>) -> Result<Self::Running, CaptureError>;
    fn list_devices(kind: SourceKind) -> Vec<AudioDeviceInfo>;
    fn watch_default_output_device(on_change: DeviceChangeHandler);
}

#[cfg(target_os = "macos")]
type Backend = macos::Backend;
#[cfg(target_os = "windows")]
type Backend = windows::Backend;

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
compile_error!(
    "захват системного звука реализован только для macOS и Windows: \
     добавьте модуль capture/<os>.rs с `impl CaptureBackend`"
);

/// Whether capturing system audio needs an OS permission at all. macOS gates a
/// Core Audio process tap behind TCC; Windows WASAPI loopback has no permission
/// to ask for. Everything that differs between the platforms in the *messages*
/// below follows from this one fact rather than from its own `#[cfg]`.
pub const REQUIRES_PERMISSION: bool = cfg!(target_os = "macos");
use crate::sync::{CondvarExt, MutexExt};

/// The ring only has to bridge the gap between two consumer drains, and the
/// consumer is now woken by the callback rather than by a poll — one second is
/// still ~200x the `CONSUMER_IDLE_SLEEP` safety net.
const RING_SECONDS: usize = 1;
/// The hard ceiling, and the one that actually bounds the worst case: the ring's
/// element count scales with the device, so `sample_rate * channels` is ~384 KB
/// for 48 kHz stereo but ~12 MB for a 7.1 tap at 96 kHz — and auto mode holds two
/// captures open at once.
const RING_MAX_BYTES: usize = 1 << 20;
/// How much audio the callback lets pile up before it wakes the consumer.
const WAKE_THRESHOLD_MS: usize = 10;
const CONSUMER_THREAD_NAME: &str = "audio-consumer";
/// `raw` carries only the tail of a pop that did not land on a frame boundary —
/// always fewer samples than the device has channels.
const RAW_REMAINDER_CAPACITY: usize = 64;
const MONO_SCRATCH_CAPACITY: usize = 16 * 1024;
const READ_BUF_SAMPLES: usize = 16 * 1024;
/// The watchdog polls once a second, so a session can overrun the ceiling by
/// about that much before it is cut off.
const OUT_PREALLOC_HEADROOM_SECS: usize = 2;
const CONSUMER_IDLE_SLEEP: Duration = Duration::from_millis(5);
const STOP_WAIT_TIMEOUT: Duration = Duration::from_secs(5);

/// The consumer's output buffer is sized for the recording ceiling instead of a
/// thirty-second guess. `state::MAX_RECORDING_SECS` is where the watchdog cuts a
/// session off, so nothing can exceed it, while every growth step on the way
/// there memcpy'd the whole recording so far on the consumer thread with the
/// capture still live — the last one moved ~19 MB. What is reserved here is
/// address space, not resident memory: the pages are faulted in only as the
/// recording actually fills them.
fn out_capacity() -> usize {
    let secs = crate::state::MAX_RECORDING_SECS as usize + OUT_PREALLOC_HEADROOM_SECS;
    secs * audio::TARGET_SAMPLE_RATE as usize
}

/// How many `f32`s the ring holds for a stream of this shape.
fn ring_capacity(spec: &StreamSpec) -> usize {
    let channels = spec.channels.max(1);
    let per_second = spec.sample_rate as usize * channels;
    (per_second * RING_SECONDS)
        .min(RING_MAX_BYTES / std::mem::size_of::<f32>())
        .max(channels)
}

#[derive(Debug, thiserror::Error)]
pub enum CaptureError {
    #[error("Нет разрешения на запись системного звука")]
    PermissionDenied,
    #[error("{0}")]
    Backend(String),
    #[error("Обработка аудио: {0}")]
    Audio(String),
}

impl crate::error::CodedError for CaptureError {
    fn code(&self) -> crate::error::ErrorCode {
        use crate::error::ErrorCode;
        match self {
            CaptureError::PermissionDenied => ErrorCode::Permission,
            CaptureError::Backend(_) | CaptureError::Audio(_) => ErrorCode::Internal,
        }
    }
}

/// The two sentences `recording.rs` used to hold as `#[cfg]`-split constants.
/// They live here because the difference between them is a property of the
/// capture backend, and they derive it from `REQUIRES_PERMISSION` rather than
/// from a second pair of platform branches.
pub fn no_capture_error() -> crate::error::AppError {
    if REQUIRES_PERMISSION {
        crate::error::AppError::with_subject(
            crate::error::ErrorCode::Permission,
            "Нет разрешения на запись системного звука",
            crate::error::subject::SYSTEM_AUDIO_PERMISSION,
        )
    } else {
        crate::error::AppError::with_subject(
            crate::error::ErrorCode::Internal,
            "Захват системного звука недоступен — проверь устройство вывода в настройках",
            crate::error::subject::SYSTEM_AUDIO_DEVICE,
        )
    }
}

pub fn silence_error() -> crate::error::AppError {
    let (hint, subject) = if REQUIRES_PERMISSION {
        (
            "проверь право «Запись системного звука» у macOS и устройство захвата в настройках",
            crate::error::subject::SILENCE_GATED,
        )
    } else {
        (
            "проверь устройство вывода в настройках захвата",
            crate::error::subject::SILENCE_DEVICE,
        )
    };
    crate::error::AppError::with_subject(
        crate::error::ErrorCode::Silence,
        format!("Тишина — нечего распознавать (если звук играл: {hint})"),
        subject,
    )
}

pub type ChunkSink = Box<dyn FnMut(&[f32]) + Send>;
pub type SegmentSink = Box<dyn FnMut(Vec<f32>) + Send>;
pub type DeviceChangeHandler = Box<dyn Fn() + Send + Sync>;

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum SourceKind {
    Output,
    Input,
}

struct Segmenting {
    segmenter: audio::SpeechSegmenter,
    sink: SegmentSink,
}

pub struct StreamSpec {
    pub sample_rate: u32,
    pub channels: usize,
}

enum Session {
    Idle,
    Start(Option<ChunkSink>),
    Running,
    Done(Result<Vec<f32>, String>),
}

struct Shared {
    recording: AtomicBool,
    buffering: AtomicBool,
    stop_requested: AtomicBool,
    shutdown: AtomicBool,
    stalled: AtomicBool,
    produced: AtomicU64,
    dropped: AtomicU64,
    sample_rate: u32,
    channels: usize,
    session: Mutex<Session>,
    rolling: Mutex<audio::RollingBuffer>,
    segmenting: Mutex<Option<Segmenting>>,
    cv: Condvar,
    /// The consumer parks here between ring loads. The audio callback only ever
    /// *signals* `data_cv` — it never takes `data_latch`, because a real-time
    /// thread must not be able to wait on the consumer. The price is that a
    /// signal landing between the consumer's last empty pop and its park is
    /// lost, which is exactly what `CONSUMER_IDLE_SLEEP` is still here for: it
    /// went from being the polling interval to being the safety net.
    data_latch: Mutex<()>,
    data_cv: Condvar,
}

pub(crate) struct CallbackCtx {
    shared: Arc<Shared>,
    prod: HeapProd<f32>,
    /// Samples pushed since the consumer was last woken, and the threshold that
    /// wakes it. Both live in the callback's own struct so that deciding to wake
    /// costs neither an atomic nor a lock.
    since_wake: usize,
    wake_threshold: usize,
}

impl CallbackCtx {
    pub(crate) fn wants_samples(&self) -> bool {
        self.shared.recording.load(Ordering::Acquire)
            || self.shared.buffering.load(Ordering::Acquire)
    }

    pub(crate) fn push_samples(&mut self, samples: &[f32]) {
        let pushed = self.prod.push_slice(samples);
        self.shared.produced.fetch_add(pushed as u64, Ordering::Relaxed);
        if pushed < samples.len() {
            self.shared
                .dropped
                .fetch_add((samples.len() - pushed) as u64, Ordering::Relaxed);
        }
        // Waking the consumer the moment a frame's worth is queued is what
        // replaced the 5 ms poll it used to sit in, and it costs the real-time
        // thread one uncontended `notify_one` — no allocation, no lock to wait
        // on, and at most one wake per `WAKE_THRESHOLD_MS` of audio.
        self.since_wake += pushed;
        if self.since_wake >= self.wake_threshold {
            self.since_wake = 0;
            self.shared.data_cv.notify_one();
        }
    }
}

/// The capture as its *consumers* see it: push-to-talk, auto listening and the
/// launcher's audio check drive a device through this port, never through the
/// concrete `AudioCapture`.
///
/// The reason is testability, and it is not theoretical: `AudioCapture::new`
/// opens a Core Audio process tap or a WASAPI loopback endpoint, so every code
/// path that touches a live capture — the whole push-to-talk pipeline — was
/// unreachable from a unit test. `CaptureService` holds a `Box<dyn
/// CaptureDevice>`, so a test installs a fake and can make `start` fail or the
/// recording last ten minutes without owning a sound card.
///
/// This is a different port from `CaptureBackend`: that one is the *platform*
/// (compile-time, one per OS), this one is the *device* (run-time, swappable).
pub trait CaptureDevice: Send {
    fn start(&mut self, sink: Option<ChunkSink>) -> Result<(), CaptureError>;
    fn stop(&mut self) -> Result<Vec<f32>, CaptureError>;
    fn is_stalled(&self) -> bool;
    fn recording_secs(&self) -> f32;
    fn set_buffering(&self, enabled: bool);
    fn set_buffer_capacity_secs(&self, secs: u64);
    fn start_segmenting(&self, bounds: audio::SegmenterBounds, sink: SegmentSink);
    fn stop_segmenting(&self);
}

pub struct AudioCapture {
    shared: Arc<Shared>,
    _running: <Backend as CaptureBackend>::Running,
}

#[derive(Debug, Clone, serde::Serialize, specta::Type)]
pub struct AudioDeviceInfo {
    pub uid: String,
    pub name: String,
}

pub fn list_devices(kind: SourceKind) -> Vec<AudioDeviceInfo> {
    Backend::list_devices(kind)
}

pub fn watch_default_output_device(on_change: DeviceChangeHandler) {
    Backend::watch_default_output_device(on_change);
}

impl AudioCapture {
    pub fn new(
        kind: SourceKind,
        device_uid: Option<&str>,
        buffer_secs: u64,
    ) -> Result<Self, CaptureError> {
        let (source, spec) = Backend::open(kind, device_uid)?;

        let ring = HeapRb::<f32>::new(ring_capacity(&spec));
        let (prod, cons) = ring.split();
        let wake_threshold =
            (spec.sample_rate as usize * spec.channels.max(1) * WAKE_THRESHOLD_MS / 1000).max(1);
        let shared = Arc::new(Shared {
            recording: AtomicBool::new(false),
            buffering: AtomicBool::new(false),
            stop_requested: AtomicBool::new(false),
            shutdown: AtomicBool::new(false),
            stalled: AtomicBool::new(false),
            produced: AtomicU64::new(0),
            dropped: AtomicU64::new(0),
            sample_rate: spec.sample_rate,
            channels: spec.channels,
            session: Mutex::new(Session::Idle),
            rolling: Mutex::new(audio::RollingBuffer::new(buffer_secs)),
            segmenting: Mutex::new(None),
            cv: Condvar::new(),
            data_latch: Mutex::new(()),
            data_cv: Condvar::new(),
        });
        let ctx = Box::new(CallbackCtx {
            shared: Arc::clone(&shared),
            prod,
            since_wake: 0,
            wake_threshold,
        });

        {
            let shared = Arc::clone(&shared);
            std::thread::Builder::new()
                .name(CONSUMER_THREAD_NAME.into())
                .spawn(move || consumer_main(&shared, cons))
                .map_err(|e| CaptureError::Audio(e.to_string()))?;
        }

        let running = match Backend::start(source, ctx) {
            Ok(running) => running,
            Err(e) => {
                // Self is not built yet, so Drop will not run — without an
                // explicit shutdown the consumer would park in the condvar
                // forever with its Arc<Shared> and the ring: one thread plus a
                // couple of megabytes per failed start (the common case being a
                // TCC denial on the microphone).
                shutdown_consumer(&shared);
                return Err(e);
            }
        };

        Ok(Self {
            shared,
            _running: running,
        })
    }

    pub fn start(&mut self, sink: Option<ChunkSink>) -> Result<(), CaptureError> {
        self.shared.stop_requested.store(false, Ordering::Release);
        let mut s = self.shared.session.lock_safe();
        *s = Session::Start(sink);
        self.shared.cv.notify_all();
        Ok(())
    }

    pub fn stop(&mut self) -> Result<Vec<f32>, CaptureError> {
        self.shared.stop_requested.store(true, Ordering::Release);
        // Without this the consumer would notice the flag only when its wait
        // times out, adding `CONSUMER_IDLE_SLEEP` to every key release.
        self.shared.data_cv.notify_all();
        let mut s = self.shared.session.lock_safe();
        loop {
            match &mut *s {
                Session::Done(res) => {
                    let res = std::mem::replace(res, Ok(Vec::new()));
                    *s = Session::Idle;
                    return res.map_err(CaptureError::Audio);
                }
                Session::Idle => return Ok(Vec::new()),
                _ => {
                    let (guard, timeout) = self.shared.cv.wait_timeout_safe(s, STOP_WAIT_TIMEOUT);
                    s = guard;
                    if timeout.timed_out() {
                        return Err(CaptureError::Audio(format!(
                            "консьюмер не завершил запись за {}с",
                            STOP_WAIT_TIMEOUT.as_secs()
                        )));
                    }
                }
            }
        }
    }

    // A backend whose stream cannot be reopened with the spec this capture was built
    // for (the endpoint's mix format changed, the device was taken away) raises this
    // flag instead of dying: the ring and the resampler are sized for the old spec, so
    // only a full rebuild can fix it. Nothing polls the flag — `recording.rs` checks it
    // at the entry points, the same lazy policy as `capture_rebuild_pending`.
    pub fn is_stalled(&self) -> bool {
        self.shared.stalled.load(Ordering::Acquire)
    }

    pub fn recording_secs(&self) -> f32 {
        let samples = self.shared.produced.load(Ordering::Relaxed);
        let frames = samples / self.shared.channels.max(1) as u64;
        frames as f32 / self.shared.sample_rate.max(1) as f32
    }

    pub fn set_buffering(&self, enabled: bool) {
        self.shared.buffering.store(enabled, Ordering::Release);
        if enabled {
            let _wake = self.shared.session.lock_safe();
            self.shared.cv.notify_all();
        } else {
            self.shared.rolling.lock_safe().clear();
        }
    }

    pub fn set_buffer_capacity_secs(&self, secs: u64) {
        self.shared.rolling.lock_safe().set_capacity_secs(secs);
    }

    pub fn start_segmenting(&self, bounds: audio::SegmenterBounds, sink: SegmentSink) {
        let segmenter = audio::SpeechSegmenter::new(bounds);
        *self.shared.segmenting.lock_safe() = Some(Segmenting { segmenter, sink });
    }

    pub fn stop_segmenting(&self) {
        *self.shared.segmenting.lock_safe() = None;
    }
}

/// Forwarding, on purpose: the inherent methods stay the API the concrete
/// capture is used through inside `capture.rs` (and by `auto`/`audio_check`,
/// which own a microphone directly), while the trait is what leaves the module.
impl CaptureDevice for AudioCapture {
    fn start(&mut self, sink: Option<ChunkSink>) -> Result<(), CaptureError> {
        AudioCapture::start(self, sink)
    }

    fn stop(&mut self) -> Result<Vec<f32>, CaptureError> {
        AudioCapture::stop(self)
    }

    fn is_stalled(&self) -> bool {
        AudioCapture::is_stalled(self)
    }

    fn recording_secs(&self) -> f32 {
        AudioCapture::recording_secs(self)
    }

    fn set_buffering(&self, enabled: bool) {
        AudioCapture::set_buffering(self, enabled);
    }

    fn set_buffer_capacity_secs(&self, secs: u64) {
        AudioCapture::set_buffer_capacity_secs(self, secs);
    }

    fn start_segmenting(&self, bounds: audio::SegmenterBounds, sink: SegmentSink) {
        AudioCapture::start_segmenting(self, bounds, sink);
    }

    fn stop_segmenting(&self) {
        AudioCapture::stop_segmenting(self);
    }
}

fn shutdown_consumer(shared: &Shared) {
    shared.shutdown.store(true, Ordering::Release);
    shared.stop_requested.store(true, Ordering::Release);
    shared.data_cv.notify_all();
    let _wake = shared.session.lock_safe();
    shared.cv.notify_all();
}

// Without this a dropped capture would leak its consumer thread forever. That used
// to happen at most once per device rebuild; the auto-mode toggle drops the
// microphone capture every time it is switched off.
impl Drop for AudioCapture {
    fn drop(&mut self) {
        *self.shared.segmenting.lock_safe() = None;
        shutdown_consumer(&self.shared);
    }
}

struct Scratch {
    raw: Vec<f32>,
    mono: Vec<f32>,
    read_buf: Vec<f32>,
}

impl Scratch {
    fn new() -> Self {
        Self {
            raw: Vec::with_capacity(RAW_REMAINDER_CAPACITY),
            mono: Vec::with_capacity(MONO_SCRATCH_CAPACITY),
            read_buf: vec![0f32; READ_BUF_SAMPLES],
        }
    }
}

/// Parks the consumer until the audio callback signals that the ring has data,
/// with the old idle sleep kept as the timeout.
///
/// The callback never takes `data_latch` — it only signals — so a signal that
/// lands after the caller's last empty pop but before this park is lost. The
/// timeout is what bounds that window, and it bounds it at exactly the latency
/// the unconditional sleep used to cost on every chunk.
fn wait_for_samples(shared: &Shared) {
    let latch = shared.data_latch.lock_safe();
    let (_guard, _timed_out) = shared.data_cv.wait_timeout_safe(latch, CONSUMER_IDLE_SLEEP);
}

enum ConsumerWork {
    Session(Option<ChunkSink>),
    Buffering,
}

enum ConsumerNext {
    Work(ConsumerWork),
    Shutdown,
}

fn wait_for_work(shared: &Shared) -> ConsumerNext {
    let mut s = shared.session.lock_safe();
    loop {
        if shared.shutdown.load(Ordering::Acquire) {
            return ConsumerNext::Shutdown;
        }
        if let Session::Start(sink) = &mut *s {
            let sink = sink.take();
            *s = Session::Running;
            return ConsumerNext::Work(ConsumerWork::Session(sink));
        }
        if shared.buffering.load(Ordering::Acquire) {
            return ConsumerNext::Work(ConsumerWork::Buffering);
        }
        s = shared.cv.wait_safe(s);
    }
}

fn consumer_main(shared: &Shared, mut ring: HeapCons<f32>) {
    let mut scratch = Scratch::new();
    loop {
        match wait_for_work(shared) {
            ConsumerNext::Shutdown => return,
            ConsumerNext::Work(ConsumerWork::Session(sink)) => {
                run_ptt_session(shared, &mut ring, &mut scratch, sink)
            }
            ConsumerNext::Work(ConsumerWork::Buffering) => {
                run_buffering(shared, &mut ring, &mut scratch)
            }
        }
    }
}

/// Downmixes one ring load, carrying across the sub-frame remainder a pop can
/// end on.
///
/// Splitting it out of `drain_ring_chunk` is what makes the carry-over testable:
/// the loads a device hands over are not multiples of the channel count, and the
/// frame boundaries have to survive the seam exactly as they did when the load
/// was appended to the remainder and the two were downmixed together.
fn downmix_load(channels: usize, load: &[f32], raw: &mut Vec<f32>, mono: &mut Vec<f32>) {
    let channels = channels.max(1);
    let mut off = 0;
    if !raw.is_empty() {
        let take = (channels - raw.len()).min(load.len());
        raw.extend_from_slice(&load[..take]);
        off = take;
        if raw.len() == channels {
            audio::downmix_into(raw, channels, mono);
            raw.clear();
        }
    }
    let rest = &load[off..];
    let whole = rest.len() - rest.len() % channels;
    audio::downmix_into(&rest[..whole], channels, mono);
    raw.extend_from_slice(&rest[whole..]);
}

/// Pops one ring load and leaves the mono samples in `scratch.mono`.
///
/// The pop lands in `read_buf` and the downmix reads straight out of it. `raw`
/// used to receive a copy of every captured sample purely so that a remainder of
/// fewer than `channels` samples could be carried to the next call — a second
/// full memcpy of the whole stream. It now holds the remainder and nothing else.
fn drain_ring_chunk(shared: &Shared, ring: &mut HeapCons<f32>, scratch: &mut Scratch) -> usize {
    let n = ring.pop_slice(&mut scratch.read_buf);
    if n == 0 {
        return 0;
    }
    scratch.mono.clear();
    downmix_load(
        shared.channels,
        &scratch.read_buf[..n],
        &mut scratch.raw,
        &mut scratch.mono,
    );
    n
}

fn run_ptt_session(
    shared: &Shared,
    ring: &mut HeapCons<f32>,
    scratch: &mut Scratch,
    mut sink: Option<ChunkSink>,
) {
    while ring.pop_slice(&mut scratch.read_buf) > 0 {}
    scratch.raw.clear();
    shared.produced.store(0, Ordering::Relaxed);
    shared.dropped.store(0, Ordering::Relaxed);

    let mut resampler = audio::StreamResampler::new(shared.sample_rate);
    let mut out: Vec<f32> = Vec::with_capacity(out_capacity());
    let mut failure: Option<String> = None;

    shared.recording.store(true, Ordering::Release);

    loop {
        let stopping = shared.stop_requested.load(Ordering::Acquire);
        if stopping {
            shared.recording.store(false, Ordering::Release);
        }
        let n = drain_ring_chunk(shared, ring, scratch);
        if n > 0 {
            if failure.is_none() {
                let before = out.len();
                match &mut resampler {
                    Ok(rs) => {
                        if let Err(e) = rs.feed(&scratch.mono, &mut out) {
                            failure = Some(e.to_string());
                        }
                    }
                    Err(e) => failure = Some(e.to_string()),
                }
                forward_session_chunk(shared, &out[before..], &mut sink);
            }
            continue;
        }
        if stopping {
            break;
        }
        wait_for_samples(shared);
    }

    if failure.is_none() {
        let before = out.len();
        if let Ok(rs) = &mut resampler {
            if let Err(e) = rs.finish(&mut out) {
                failure = Some(e.to_string());
            }
        }
        forward_session_chunk(shared, &out[before..], &mut sink);
    }
    drop(sink);

    let dropped = shared.dropped.load(Ordering::Relaxed);
    if dropped > 0 {
        eprintln!("[perf] капчер: кольцо переполнялось, потеряно {dropped} сэмплов");
    }

    let mut s = shared.session.lock_safe();
    *s = Session::Done(match failure {
        None => Ok(out),
        Some(e) => Err(e),
    });
    shared.cv.notify_all();
}

fn forward_session_chunk(shared: &Shared, chunk: &[f32], sink: &mut Option<ChunkSink>) {
    if chunk.is_empty() {
        return;
    }
    if let Some(sink) = sink.as_mut() {
        sink(chunk);
    }
    if shared.buffering.load(Ordering::Acquire) {
        shared.rolling.lock_safe().push_chunk(chunk);
    }
}

struct BufferedSession {
    out: Vec<f32>,
    sink: Option<ChunkSink>,
}

fn take_pending_session(shared: &Shared) -> Option<BufferedSession> {
    let mut s = shared.session.lock_safe();
    let Session::Start(sink) = &mut *s else {
        return None;
    };
    let mut sink = sink.take();
    *s = Session::Running;
    drop(s);
    shared.produced.store(0, Ordering::Relaxed);
    shared.dropped.store(0, Ordering::Relaxed);
    shared.recording.store(true, Ordering::Release);
    let preroll = shared.rolling.lock_safe().snapshot();
    let mut out = Vec::with_capacity(preroll.len() + out_capacity());
    out.extend_from_slice(&preroll);
    if !preroll.is_empty() {
        if let Some(sink) = sink.as_mut() {
            sink(&preroll);
        }
    }
    Some(BufferedSession { out, sink })
}

fn finish_buffered_session(
    shared: &Shared,
    session: &mut Option<BufferedSession>,
    result: Result<(), String>,
) {
    shared.recording.store(false, Ordering::Release);
    let Some(sess) = session.take() else { return };
    drop(sess.sink);
    let dropped = shared.dropped.load(Ordering::Relaxed);
    if dropped > 0 {
        eprintln!("[perf] капчер: кольцо переполнялось, потеряно {dropped} сэмплов");
    }
    let mut s = shared.session.lock_safe();
    *s = Session::Done(result.map(|()| sess.out));
    shared.cv.notify_all();
}

// The `segmenting` lock is taken only after `session` and `rolling` are released.
// Calling the sink while holding the lock is deliberate: it never touches `Shared`,
// it only bumps auto-mode counters and spawns a task.
fn feed_segmenter(shared: &Shared, chunk: &[f32]) {
    let mut guard = shared.segmenting.lock_safe();
    let Some(state) = guard.as_mut() else {
        return;
    };
    for segment in state.segmenter.push(chunk) {
        (state.sink)(segment);
    }
}

fn run_buffering(shared: &Shared, ring: &mut HeapCons<f32>, scratch: &mut Scratch) {
    let mut resampler = match audio::StreamResampler::new(shared.sample_rate) {
        Ok(rs) => rs,
        Err(e) => {
            eprintln!("фоновый буфер: ресемплер недоступен: {e}");
            shared.buffering.store(false, Ordering::Release);
            return;
        }
    };
    let mut chunk: Vec<f32> = Vec::with_capacity(MONO_SCRATCH_CAPACITY);
    let mut session: Option<BufferedSession> = None;

    loop {
        if session.is_none() {
            if shared.shutdown.load(Ordering::Acquire) {
                return;
            }
            if !shared.buffering.load(Ordering::Acquire) {
                shared.rolling.lock_safe().clear();
                return;
            }
            session = take_pending_session(shared);
        }
        let stopping = session.is_some() && shared.stop_requested.load(Ordering::Acquire);
        if stopping {
            shared.recording.store(false, Ordering::Release);
        }
        let n = drain_ring_chunk(shared, ring, scratch);
        if n > 0 {
            chunk.clear();
            if let Err(e) = resampler.feed(&scratch.mono, &mut chunk) {
                eprintln!("фоновый буфер: ресемплинг упал: {e}");
                finish_buffered_session(shared, &mut session, Err(e.to_string()));
                shared.buffering.store(false, Ordering::Release);
                shared.rolling.lock_safe().clear();
                return;
            }
            if !chunk.is_empty() {
                if shared.buffering.load(Ordering::Acquire) {
                    shared.rolling.lock_safe().push_chunk(&chunk);
                }
                feed_segmenter(shared, &chunk);
                if let Some(sess) = session.as_mut() {
                    sess.out.extend_from_slice(&chunk);
                    if let Some(sink) = sess.sink.as_mut() {
                        sink(&chunk);
                    }
                }
            }
            continue;
        }
        if stopping {
            finish_buffered_session(shared, &mut session, Ok(()));
            continue;
        }
        wait_for_samples(shared);
    }
}

/// The fake device the recording tests drive.
///
/// It lives next to the port rather than in one test module because three
/// services take a `CaptureDevice` (`recording`, `auto`, the audio check) and a
/// second copy of it would drift. Everything observable is an atomic behind an
/// `Arc`, so a test can install the device into a `CaptureService` and still
/// read what happened to it.
#[cfg(test)]
#[derive(Default)]
pub struct FakeCaptureState {
    pub start_fails: AtomicBool,
    pub stop_fails: AtomicBool,
    pub stalled: AtomicBool,
    /// What `recording_secs` answers, in milliseconds (an atomic cannot hold f32).
    pub recording_millis: AtomicU64,
    pub starts: AtomicU64,
    pub stops: AtomicU64,
    pub buffering: AtomicBool,
    pub segmenting: AtomicBool,
    /// What `stop` hands back when it succeeds.
    pub samples: Mutex<Vec<f32>>,
}

#[cfg(test)]
impl FakeCaptureState {
    pub fn set_recording_secs(&self, secs: f32) {
        self.recording_millis
            .store((secs * 1000.0) as u64, Ordering::Release);
    }

    pub fn set_samples(&self, samples: Vec<f32>) {
        use crate::sync::MutexExt;
        *self.samples.lock_safe() = samples;
    }
}

#[cfg(test)]
pub struct FakeCapture(pub Arc<FakeCaptureState>);

#[cfg(test)]
impl FakeCapture {
    /// Builds the device and hands back the handle the test keeps.
    pub fn installable() -> (Box<dyn CaptureDevice>, Arc<FakeCaptureState>) {
        let state = Arc::new(FakeCaptureState::default());
        (Box::new(FakeCapture(Arc::clone(&state))), state)
    }
}

#[cfg(test)]
impl CaptureDevice for FakeCapture {
    fn start(&mut self, _sink: Option<ChunkSink>) -> Result<(), CaptureError> {
        if self.0.start_fails.load(Ordering::Acquire) {
            return Err(CaptureError::Backend("фейковый захват не стартует".into()));
        }
        self.0.starts.fetch_add(1, Ordering::AcqRel);
        Ok(())
    }

    fn stop(&mut self) -> Result<Vec<f32>, CaptureError> {
        use crate::sync::MutexExt;
        self.0.stops.fetch_add(1, Ordering::AcqRel);
        if self.0.stop_fails.load(Ordering::Acquire) {
            return Err(CaptureError::Backend("фейковый захват не остановился".into()));
        }
        Ok(self.0.samples.lock_safe().clone())
    }

    fn is_stalled(&self) -> bool {
        self.0.stalled.load(Ordering::Acquire)
    }

    fn recording_secs(&self) -> f32 {
        self.0.recording_millis.load(Ordering::Acquire) as f32 / 1000.0
    }

    fn set_buffering(&self, enabled: bool) {
        self.0.buffering.store(enabled, Ordering::Release);
    }

    fn set_buffer_capacity_secs(&self, _secs: u64) {}

    fn start_segmenting(&self, _bounds: audio::SegmenterBounds, _sink: SegmentSink) {
        self.0.segmenting.store(true, Ordering::Release);
    }

    fn stop_segmenting(&self) {
        self.0.segmenting.store(false, Ordering::Release);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn spec(sample_rate: u32, channels: usize) -> StreamSpec {
        StreamSpec {
            sample_rate,
            channels,
        }
    }

    #[test]
    fn the_ring_holds_a_second_of_an_ordinary_device() {
        assert_eq!(
            ring_capacity(&spec(48_000, 2)),
            48_000 * 2 * RING_SECONDS,
            "48 kHz stereo fits under the byte cap"
        );
    }

    #[test]
    fn the_ring_is_capped_in_bytes_however_wide_the_device_is() {
        let surround = ring_capacity(&spec(96_000, 8));
        assert_eq!(
            surround * std::mem::size_of::<f32>(),
            RING_MAX_BYTES,
            "a 7.1 tap at 96 kHz is capped, not scaled"
        );
        assert!(surround < 96_000 * 8 * RING_SECONDS);
    }

    #[test]
    fn the_ring_is_never_empty_even_for_a_nonsense_spec() {
        assert!(ring_capacity(&spec(0, 0)) > 0);
    }

    #[test]
    fn the_output_buffer_is_reserved_for_the_whole_recording_ceiling() {
        let ceiling = crate::state::MAX_RECORDING_SECS as usize * audio::TARGET_SAMPLE_RATE as usize;
        assert!(out_capacity() >= ceiling);
    }

    /// Loads arrive from the device in sizes that are not multiples of the
    /// channel count, and the downmix must not notice the seam.
    #[test]
    fn downmix_load_matches_downmixing_the_stream_in_one_piece() {
        let stream: Vec<f32> = (0..1024).map(|i| (i % 17) as f32 * 0.01).collect();
        for channels in [0usize, 1, 2, 6, 8] {
            let effective = channels.max(1);
            let whole = stream.len() - stream.len() % effective;
            let mut expected = Vec::new();
            audio::downmix_into(&stream[..whole], effective, &mut expected);

            for load in [1usize, 3, 7, 64, 333, 4096] {
                let mut raw = Vec::new();
                let mut mono = Vec::new();
                for piece in stream.chunks(load) {
                    downmix_load(channels, piece, &mut raw, &mut mono);
                }
                assert_eq!(mono, expected, "channels={channels} load={load}");
                assert!(raw.len() < effective, "channels={channels} load={load}");
            }
        }
    }

    #[test]
    fn downmix_load_carries_a_partial_frame_across_calls() {
        let mut raw = Vec::new();
        let mut mono = Vec::new();
        downmix_load(2, &[1.0, 0.0, 0.5], &mut raw, &mut mono);
        assert_eq!(mono, vec![0.5], "only the complete frame is emitted");
        assert_eq!(raw, vec![0.5], "the odd sample waits for its partner");

        downmix_load(2, &[0.5], &mut raw, &mut mono);
        assert_eq!(mono, vec![0.5, 0.5], "the carried sample completes a frame");
        assert!(raw.is_empty());
    }
}
