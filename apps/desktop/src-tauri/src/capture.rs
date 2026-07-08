use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::time::Duration;

use cidre::{
    cat, cf,
    core_audio::{self as ca, aggregate_device_keys as agg_keys, sub_device_keys as sub_keys},
    ns, os,
};
use ringbuf::traits::{Consumer, Producer, Split};
use ringbuf::{HeapCons, HeapProd, HeapRb};

use crate::audio;

const OS_STATUS_ILLEGAL_OPERATION: i32 = i32::from_be_bytes(*b"!hog");
const SAMPLE_BYTES: usize = std::mem::size_of::<f32>();
const F32_BITS_PER_CHANNEL: u32 = (SAMPLE_BYTES * 8) as u32;
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
    #[error("Core Audio: {0}")]
    CoreAudio(String),
    #[error("Обработка аудио: {0}")]
    Audio(String),
}

impl CaptureError {
    fn from_os(err: os::Error) -> Self {
        if err.0.get() == OS_STATUS_ILLEGAL_OPERATION {
            CaptureError::PermissionDenied
        } else {
            CaptureError::CoreAudio(format!("{err}"))
        }
    }
}

pub type ChunkSink = Box<dyn FnMut(&[f32]) + Send>;

enum Session {
    Idle,
    Start(Option<ChunkSink>),
    Running,
    Done(Result<Vec<f32>, String>),
}

struct Shared {
    recording: AtomicBool,
    stop_requested: AtomicBool,
    produced: AtomicU64,
    dropped: AtomicU64,
    sample_rate: u32,
    channels: usize,
    session: Mutex<Session>,
    cv: Condvar,
}

struct CallbackCtx {
    shared: Arc<Shared>,
    prod: HeapProd<f32>,
}

pub struct SystemAudioCapture {
    shared: Arc<Shared>,
    _started: ca::hardware::StartedDevice<ca::AggregateDevice>,
    _tap: ca::TapGuard,
    _ctx: Box<CallbackCtx>,
}

unsafe impl Send for SystemAudioCapture {}

impl SystemAudioCapture {
    pub fn new() -> Result<Self, CaptureError> {
        let tap_desc = ca::TapDesc::with_stereo_global_tap_excluding_processes(&ns::Array::new());

        let tap = tap_desc
            .create_process_tap()
            .map_err(CaptureError::from_os)?;
        let tap_uid = tap.uid().map_err(CaptureError::from_os)?;

        let asbd = tap.asbd().map_err(CaptureError::from_os)?;

        if !asbd.format_flags.contains(cat::audio::FormatFlags::IS_FLOAT)
            || asbd.format_flags.contains(cat::audio::FormatFlags::IS_NON_INTERLEAVED)
            || asbd.bits_per_channel != F32_BITS_PER_CHANNEL
        {
            return Err(CaptureError::CoreAudio(format!(
                "неожиданный формат tap: format_flags={:#010x}, bits_per_channel={}",
                asbd.format_flags.0, asbd.bits_per_channel
            )));
        }

        let sample_rate = asbd.sample_rate as u32;
        let channels = asbd.channels_per_frame as usize;

        let output_device = ca::System::default_output_device().map_err(CaptureError::from_os)?;
        let output_uid = output_device.uid().map_err(CaptureError::from_os)?;
        let sub_device =
            cf::DictionaryOf::with_keys_values(&[sub_keys::uid()], &[output_uid.as_type_ref()]);
        let sub_tap =
            cf::DictionaryOf::with_keys_values(&[sub_keys::uid()], &[tap_uid.as_type_ref()]);

        let dict = cf::DictionaryOf::with_keys_values(
            &[
                agg_keys::is_private(),
                agg_keys::is_stacked(),
                agg_keys::tap_auto_start(),
                agg_keys::name(),
                agg_keys::main_sub_device(),
                agg_keys::uid(),
                agg_keys::sub_device_list(),
                agg_keys::tap_list(),
            ],
            &[
                cf::Boolean::value_true().as_type_ref(),
                cf::Boolean::value_false(),
                cf::Boolean::value_true(),
                cf::str!(c"audio-system-tap"),
                &output_uid,
                &cf::Uuid::new().to_cf_string(),
                &cf::ArrayOf::from_slice(&[sub_device.as_ref()]),
                &cf::ArrayOf::from_slice(&[sub_tap.as_ref()]),
            ],
        );
        let agg_device = ca::AggregateDevice::with_desc(&dict).map_err(CaptureError::from_os)?;

        let ring = HeapRb::<f32>::new(sample_rate as usize * channels * RING_SECONDS);
        let (prod, cons) = ring.split();
        let shared = Arc::new(Shared {
            recording: AtomicBool::new(false),
            stop_requested: AtomicBool::new(false),
            produced: AtomicU64::new(0),
            dropped: AtomicU64::new(0),
            sample_rate,
            channels,
            session: Mutex::new(Session::Idle),
            cv: Condvar::new(),
        });
        let mut ctx = Box::new(CallbackCtx {
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

        let proc_id = agg_device
            .create_io_proc_id(io_proc, Some(ctx.as_mut()))
            .map_err(CaptureError::from_os)?;
        let started = ca::device_start(agg_device, Some(proc_id)).map_err(CaptureError::from_os)?;

        Ok(Self {
            shared,
            _started: started,
            _tap: tap,
            _ctx: ctx,
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

    pub fn recording_secs(&self) -> f32 {
        let samples = self.shared.produced.load(Ordering::Relaxed);
        let frames = samples / self.shared.channels.max(1) as u64;
        frames as f32 / self.shared.sample_rate.max(1) as f32
    }
}

fn consumer_main(shared: &Shared, mut ring: HeapCons<f32>) {
    let mut raw: Vec<f32> = Vec::with_capacity(RAW_SCRATCH_CAPACITY);
    let mut mono: Vec<f32> = Vec::with_capacity(MONO_SCRATCH_CAPACITY);
    let mut read_buf = vec![0f32; READ_BUF_SAMPLES];

    loop {
        let mut sink = {
            let mut s = shared.session.lock().unwrap();
            loop {
                if let Session::Start(sink) = &mut *s {
                    let sink = sink.take();
                    *s = Session::Running;
                    break sink;
                }
                s = shared.cv.wait(s).unwrap();
            }
        };

        while ring.pop_slice(&mut read_buf) > 0 {}
        raw.clear();
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
            let n = ring.pop_slice(&mut read_buf);
            if n > 0 {
                if failure.is_none() {
                    raw.extend_from_slice(&read_buf[..n]);
                    let whole = raw.len() - raw.len() % shared.channels.max(1);
                    mono.clear();
                    audio::downmix_into(&raw[..whole], shared.channels, &mut mono);
                    raw.drain(..whole);
                    let before = out.len();
                    match &mut resampler {
                        Ok(rs) => {
                            if let Err(e) = rs.feed(&mono, &mut out) {
                                failure = Some(e.to_string());
                            }
                        }
                        Err(e) => failure = Some(e.to_string()),
                    }
                    if let Some(sink) = sink.as_mut() {
                        if out.len() > before {
                            sink(&out[before..]);
                        }
                    }
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
            if let Some(sink) = sink.as_mut() {
                if out.len() > before {
                    sink(&out[before..]);
                }
            }
        }
        drop(sink);

        let dropped = shared.dropped.load(Ordering::Relaxed);
        if dropped > 0 {
            eprintln!("[perf] капчер: кольцо переполнялось, потеряно {dropped} сэмплов");
        }

        let mut s = shared.session.lock().unwrap();
        *s = Session::Done(match failure {
            None => Ok(std::mem::take(&mut out)),
            Some(e) => Err(e),
        });
        shared.cv.notify_all();
    }
}

extern "C" fn io_proc(
    _device: ca::Device,
    _now: &cat::AudioTimeStamp,
    input_data: &cat::AudioBufList<1>,
    _input_time: &cat::AudioTimeStamp,
    _output_data: &mut cat::AudioBufList<1>,
    _output_time: &cat::AudioTimeStamp,
    ctx: Option<&mut CallbackCtx>,
) -> os::Status {
    let Some(ctx) = ctx else {
        return os::Status::NO_ERR;
    };
    let shared = &ctx.shared;

    if !shared.recording.load(Ordering::Acquire) {
        return os::Status::NO_ERR;
    }

    let abuf = &input_data.buffers[0];
    if abuf.data.is_null() || abuf.data_bytes_size == 0 {
        return os::Status::NO_ERR;
    }

    debug_assert_eq!(abuf.data_bytes_size as usize % SAMPLE_BYTES, 0);
    let n = abuf.data_bytes_size as usize / SAMPLE_BYTES;
    let samples = unsafe { std::slice::from_raw_parts(abuf.data as *const f32, n) };

    let pushed = ctx.prod.push_slice(samples);
    shared.produced.fetch_add(pushed as u64, Ordering::Relaxed);
    if pushed < n {
        shared
            .dropped
            .fetch_add((n - pushed) as u64, Ordering::Relaxed);
    }

    os::Status::NO_ERR
}
