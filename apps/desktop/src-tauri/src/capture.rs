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

#[cfg(target_os = "macos")]
use macos as backend;
#[cfg(target_os = "windows")]
use windows as backend;

const RING_SECONDS: usize = 8;
const CONSUMER_THREAD_NAME: &str = "audio-consumer";
const RAW_SCRATCH_CAPACITY: usize = 32 * 1024;
const MONO_SCRATCH_CAPACITY: usize = 16 * 1024;
const READ_BUF_SAMPLES: usize = 16 * 1024;
const OUT_PREALLOC_SECONDS: usize = 30;
const CONSUMER_IDLE_SLEEP: Duration = Duration::from_millis(5);
const STOP_WAIT_TIMEOUT: Duration = Duration::from_secs(5);

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
}

struct CallbackCtx {
    shared: Arc<Shared>,
    prod: HeapProd<f32>,
}

impl CallbackCtx {
    fn wants_samples(&self) -> bool {
        self.shared.recording.load(Ordering::Acquire)
            || self.shared.buffering.load(Ordering::Acquire)
    }

    fn push_samples(&mut self, samples: &[f32]) {
        let pushed = self.prod.push_slice(samples);
        self.shared.produced.fetch_add(pushed as u64, Ordering::Relaxed);
        if pushed < samples.len() {
            self.shared
                .dropped
                .fetch_add((samples.len() - pushed) as u64, Ordering::Relaxed);
        }
    }
}

pub struct AudioCapture {
    shared: Arc<Shared>,
    _running: backend::Running,
}

#[derive(Debug, Clone, serde::Serialize, specta::Type)]
pub struct AudioDeviceInfo {
    pub uid: String,
    pub name: String,
}

pub fn list_devices(kind: SourceKind) -> Vec<AudioDeviceInfo> {
    backend::list_devices(kind)
}

pub fn watch_default_output_device(on_change: DeviceChangeHandler) {
    backend::watch_default_output_device(on_change);
}

impl AudioCapture {
    pub fn new(
        kind: SourceKind,
        device_uid: Option<&str>,
        buffer_secs: u64,
    ) -> Result<Self, CaptureError> {
        let (source, spec) = backend::open(kind, device_uid)?;

        let ring = HeapRb::<f32>::new(spec.sample_rate as usize * spec.channels * RING_SECONDS);
        let (prod, cons) = ring.split();
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
        });
        let ctx = Box::new(CallbackCtx {
            shared: Arc::clone(&shared),
            prod,
        });

        {
            let shared = Arc::clone(&shared);
            std::thread::Builder::new()
                .name(CONSUMER_THREAD_NAME.into())
                .spawn(move || consumer_main(&shared, cons))
                .map_err(|e| CaptureError::Audio(e.to_string()))?;
        }

        let running = backend::start(source, ctx)?;

        Ok(Self {
            shared,
            _running: running,
        })
    }

    pub fn start(&mut self, sink: Option<ChunkSink>) -> Result<(), CaptureError> {
        self.shared.stop_requested.store(false, Ordering::Release);
        let mut s = self.shared.session.lock().unwrap();
        *s = Session::Start(sink);
        self.shared.cv.notify_all();
        Ok(())
    }

    pub fn stop(&mut self) -> Result<Vec<f32>, CaptureError> {
        self.shared.stop_requested.store(true, Ordering::Release);
        let mut s = self.shared.session.lock().unwrap();
        loop {
            match &mut *s {
                Session::Done(res) => {
                    let res = std::mem::replace(res, Ok(Vec::new()));
                    *s = Session::Idle;
                    return res.map_err(CaptureError::Audio);
                }
                Session::Idle => return Ok(Vec::new()),
                _ => {
                    let (guard, timeout) = self
                        .shared
                        .cv
                        .wait_timeout(s, STOP_WAIT_TIMEOUT)
                        .unwrap();
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
            let _wake = self.shared.session.lock().unwrap();
            self.shared.cv.notify_all();
        } else {
            self.shared.rolling.lock().unwrap().clear();
        }
    }

    pub fn set_buffer_capacity_secs(&self, secs: u64) {
        self.shared.rolling.lock().unwrap().set_capacity_secs(secs);
    }

    pub fn start_segmenting(&self, bounds: audio::SegmenterBounds, sink: SegmentSink) {
        let segmenter = audio::SpeechSegmenter::new(bounds);
        *self.shared.segmenting.lock().unwrap() = Some(Segmenting { segmenter, sink });
    }

    pub fn stop_segmenting(&self) {
        *self.shared.segmenting.lock().unwrap() = None;
    }
}

// Without this a dropped capture would leak its consumer thread forever. That used
// to happen at most once per device rebuild; the auto-mode toggle drops the
// microphone capture every time it is switched off.
impl Drop for AudioCapture {
    fn drop(&mut self) {
        self.shared.shutdown.store(true, Ordering::Release);
        self.shared.stop_requested.store(true, Ordering::Release);
        *self.shared.segmenting.lock().unwrap() = None;
        let _wake = self.shared.session.lock().unwrap();
        self.shared.cv.notify_all();
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
            raw: Vec::with_capacity(RAW_SCRATCH_CAPACITY),
            mono: Vec::with_capacity(MONO_SCRATCH_CAPACITY),
            read_buf: vec![0f32; READ_BUF_SAMPLES],
        }
    }
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
    let mut s = shared.session.lock().unwrap();
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
        s = shared.cv.wait(s).unwrap();
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

fn drain_ring_chunk(
    shared: &Shared,
    ring: &mut HeapCons<f32>,
    scratch: &mut Scratch,
) -> usize {
    let n = ring.pop_slice(&mut scratch.read_buf);
    if n == 0 {
        return 0;
    }
    scratch.raw.extend_from_slice(&scratch.read_buf[..n]);
    let whole = scratch.raw.len() - scratch.raw.len() % shared.channels.max(1);
    scratch.mono.clear();
    audio::downmix_into(&scratch.raw[..whole], shared.channels, &mut scratch.mono);
    scratch.raw.drain(..whole);
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
    let mut out: Vec<f32> =
        Vec::with_capacity(audio::TARGET_SAMPLE_RATE as usize * OUT_PREALLOC_SECONDS);
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
        std::thread::sleep(CONSUMER_IDLE_SLEEP);
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

    let mut s = shared.session.lock().unwrap();
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
        shared.rolling.lock().unwrap().push_chunk(chunk);
    }
}

struct BufferedSession {
    out: Vec<f32>,
    sink: Option<ChunkSink>,
}

fn take_pending_session(shared: &Shared) -> Option<BufferedSession> {
    let mut s = shared.session.lock().unwrap();
    let Session::Start(sink) = &mut *s else {
        return None;
    };
    let mut sink = sink.take();
    *s = Session::Running;
    drop(s);
    shared.produced.store(0, Ordering::Relaxed);
    shared.dropped.store(0, Ordering::Relaxed);
    shared.recording.store(true, Ordering::Release);
    let preroll = shared.rolling.lock().unwrap().snapshot();
    let mut out = Vec::with_capacity(
        preroll.len() + audio::TARGET_SAMPLE_RATE as usize * OUT_PREALLOC_SECONDS,
    );
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
    let mut s = shared.session.lock().unwrap();
    *s = Session::Done(result.map(|()| sess.out));
    shared.cv.notify_all();
}

// The `segmenting` lock is taken only after `session` and `rolling` are released.
// Calling the sink while holding the lock is deliberate: it never touches `Shared`,
// it only bumps auto-mode counters and spawns a task.
fn feed_segmenter(shared: &Shared, chunk: &[f32]) {
    let mut guard = shared.segmenting.lock().unwrap();
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
                shared.rolling.lock().unwrap().clear();
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
                shared.rolling.lock().unwrap().clear();
                return;
            }
            if !chunk.is_empty() {
                if shared.buffering.load(Ordering::Acquire) {
                    shared.rolling.lock().unwrap().push_chunk(&chunk);
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
        std::thread::sleep(CONSUMER_IDLE_SLEEP);
    }
}
