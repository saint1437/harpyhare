use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::Arc;
use std::time::{Duration, Instant};

use windows::core::{w, PCWSTR};
use windows::Win32::Devices::FunctionDiscovery::PKEY_Device_FriendlyName;
use windows::Win32::Foundation::{
    CloseHandle, E_ACCESSDENIED, HANDLE, RPC_E_CHANGED_MODE, WAIT_OBJECT_0, WAIT_TIMEOUT,
};
use windows::Win32::Media::Audio::{
    eCapture, eConsole, eRender, IAudioCaptureClient, IAudioClient, IMMDevice, IMMDeviceEnumerator,
    MMDeviceEnumerator, AUDCLNT_BUFFERFLAGS_SILENT, AUDCLNT_SHAREMODE_SHARED,
    AUDCLNT_STREAMFLAGS_EVENTCALLBACK, AUDCLNT_STREAMFLAGS_LOOPBACK, DEVICE_STATE_ACTIVE,
    WAVEFORMATEX, WAVEFORMATEXTENSIBLE,
};
use windows::Win32::Media::KernelStreaming::WAVE_FORMAT_EXTENSIBLE;
use windows::Win32::Media::Multimedia::{KSDATAFORMAT_SUBTYPE_IEEE_FLOAT, WAVE_FORMAT_IEEE_FLOAT};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_ALL,
    COINIT_MULTITHREADED, STGM_READ,
};
use windows::Win32::System::Threading::{
    AvRevertMmThreadCharacteristics, AvSetMmThreadCharacteristicsW, CreateEventW,
    WaitForSingleObject,
};

use super::{
    AudioDeviceInfo, CallbackCtx, CaptureBackend, CaptureError, DeviceChangeHandler, SourceKind,
    StreamSpec,
};

const CAPTURE_THREAD_NAME: &str = "wasapi-capture";
const DEVICE_WATCH_THREAD_NAME: &str = "wasapi-device-watch";
const DEVICE_POLL_INTERVAL: Duration = Duration::from_secs(2);
const REFERENCE_TIMES_PER_SECOND: i64 = 10_000_000;
const CLIENT_BUFFER_SECONDS: f64 = 1.0;
const START_TIMEOUT: Duration = Duration::from_secs(5);
const REOPEN_DELAY: Duration = Duration::from_secs(1);
const MIN_POLL_INTERVAL: Duration = Duration::from_millis(2);
const MAX_POLL_INTERVAL: Duration = Duration::from_millis(20);
/// The MMCSS task class the capture thread joins for the whole of its life.
/// "Pro Audio" is the class Windows keeps for threads with a hard per-period
/// deadline, which is precisely this one's: miss enough periods and the client
/// buffer wraps, and a wrap is the `dropped` counter in `CallbackCtx`.
const MMCSS_TASK_PRO_AUDIO: PCWSTR = w!("Pro Audio");
const BITS_PER_BYTE: u16 = 8;
const FLOAT_SAMPLE_BYTES: usize = 4;
const INT16_SAMPLE_BYTES: usize = 2;
const INT32_SAMPLE_BYTES: usize = 4;
const I16_SCALE: f32 = 32768.0;
const I32_SCALE: f32 = 2_147_483_648.0;

struct ComGuard {
    owns_apartment: bool,
}

impl ComGuard {
    fn enter() -> Result<Self, CaptureError> {
        let status = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
        if status == RPC_E_CHANGED_MODE {
            return Ok(Self {
                owns_apartment: false,
            });
        }
        status.ok().map_err(backend_error)?;
        Ok(Self {
            owns_apartment: true,
        })
    }
}

impl Drop for ComGuard {
    fn drop(&mut self) {
        if self.owns_apartment {
            unsafe { CoUninitialize() };
        }
    }
}

/// Joins the MMCSS "Pro Audio" task for the life of the calling thread.
///
/// Without it the capture thread is an ordinary one, and an ordinary thread can
/// be preempted for longer than the client buffer holds: WASAPI answers a late
/// reader by overwriting, the app never sees those samples, and the only trace
/// is the `dropped` line printed after the recording has already been ruined.
/// MMCSS is what tells the scheduler this thread has a deadline; the
/// event-driven wait in `LoopbackStream::wait_for_data` is what lets it be woken
/// in time to meet it. Neither half is much use alone.
///
/// A refusal is not fatal. MMCSS is a service that a locked-down image can have
/// disabled, and a capture that is merely preemptible beats no capture at all,
/// so the error is reported once at thread start and the thread carries on
/// unregistered.
struct MmcssGuard(HANDLE);

impl MmcssGuard {
    fn enter() -> Option<Self> {
        // The task index is an out-parameter and MSDN requires it to start at
        // zero for a thread's first registration.
        let mut task_index: u32 = 0;
        match unsafe { AvSetMmThreadCharacteristicsW(MMCSS_TASK_PRO_AUDIO, &mut task_index) } {
            Ok(handle) => Some(Self(handle)),
            Err(e) => {
                eprintln!("поток захвата не получил приоритет MMCSS: {e}");
                None
            }
        }
    }
}

impl Drop for MmcssGuard {
    fn drop(&mut self) {
        unsafe { AvRevertMmThreadCharacteristics(self.0) }.ok();
    }
}

fn backend_error(err: windows::core::Error) -> CaptureError {
    if err.code() == E_ACCESSDENIED {
        CaptureError::PermissionDenied
    } else {
        CaptureError::Backend(format!("WASAPI: {err}"))
    }
}

fn enumerator() -> Result<IMMDeviceEnumerator, CaptureError> {
    unsafe { CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL) }.map_err(backend_error)
}

fn device_id(device: &IMMDevice) -> Result<String, CaptureError> {
    unsafe {
        let raw = device.GetId().map_err(backend_error)?;
        let text = raw.to_string();
        CoTaskMemFree(Some(raw.0 as *const _));
        text.map_err(|e| CaptureError::Backend(e.to_string()))
    }
}

fn device_name(device: &IMMDevice) -> Result<String, CaptureError> {
    unsafe {
        let store = device.OpenPropertyStore(STGM_READ).map_err(backend_error)?;
        let value = store
            .GetValue(&PKEY_Device_FriendlyName)
            .map_err(backend_error)?;
        Ok(value.to_string())
    }
}

fn data_flow(kind: SourceKind) -> windows::Win32::Media::Audio::EDataFlow {
    match kind {
        SourceKind::Output => eRender,
        SourceKind::Input => eCapture,
    }
}

fn collect_devices(kind: SourceKind) -> Result<Vec<AudioDeviceInfo>, CaptureError> {
    let _com = ComGuard::enter()?;
    let devices = unsafe {
        enumerator()?
            .EnumAudioEndpoints(data_flow(kind), DEVICE_STATE_ACTIVE)
            .map_err(backend_error)?
    };
    let count = unsafe { devices.GetCount().map_err(backend_error)? };
    let mut out = Vec::with_capacity(count as usize);
    for index in 0..count {
        let device = unsafe { devices.Item(index).map_err(backend_error)? };
        out.push(AudioDeviceInfo {
            uid: device_id(&device)?,
            name: device_name(&device)?,
        });
    }
    Ok(out)
}

pub fn list_devices(kind: SourceKind) -> Vec<AudioDeviceInfo> {
    match collect_devices(kind) {
        Ok(devices) => devices,
        Err(e) => {
            eprintln!("список аудиоустройств недоступен: {e}");
            Vec::new()
        }
    }
}

fn default_device(
    enumerator: &IMMDeviceEnumerator,
    kind: SourceKind,
) -> Result<IMMDevice, CaptureError> {
    unsafe { enumerator.GetDefaultAudioEndpoint(data_flow(kind), eConsole) }.map_err(backend_error)
}

fn default_output_device(enumerator: &IMMDeviceEnumerator) -> Result<IMMDevice, CaptureError> {
    default_device(enumerator, SourceKind::Output)
}

fn device_by_id(
    enumerator: &IMMDeviceEnumerator,
    device_id: &str,
) -> Result<IMMDevice, CaptureError> {
    let wide: Vec<u16> = device_id.encode_utf16().chain(std::iter::once(0)).collect();
    unsafe { enumerator.GetDevice(PCWSTR(wide.as_ptr())) }.map_err(backend_error)
}

fn resolve_device(
    enumerator: &IMMDeviceEnumerator,
    uid: Option<&str>,
    kind: SourceKind,
) -> Result<IMMDevice, CaptureError> {
    let Some(uid) = uid else {
        return default_device(enumerator, kind);
    };
    match device_by_id(enumerator, uid) {
        Ok(device) => Ok(device),
        Err(_) => {
            eprintln!(
                "устройство захвата {uid:?} не найдено — используется системное по умолчанию"
            );
            default_device(enumerator, kind)
        }
    }
}

fn current_default_device_id(enumerator: &IMMDeviceEnumerator) -> Option<String> {
    device_id(&default_output_device(enumerator).ok()?).ok()
}

pub fn watch_default_output_device(on_change: DeviceChangeHandler) {
    let spawned = std::thread::Builder::new()
        .name(DEVICE_WATCH_THREAD_NAME.into())
        .spawn(move || {
            let Ok(_com) = ComGuard::enter() else {
                return;
            };
            let Ok(enumerator) = enumerator() else {
                return;
            };
            let mut current = current_default_device_id(&enumerator);
            loop {
                std::thread::sleep(DEVICE_POLL_INTERVAL);
                let Some(next) = current_default_device_id(&enumerator) else {
                    continue;
                };
                if current.as_deref() != Some(next.as_str()) {
                    let known = current.is_some();
                    current = Some(next);
                    if known {
                        on_change();
                    }
                }
            }
        });
    if let Err(e) = spawned {
        eprintln!("не удалось следить за сменой аудио-вывода: {e}");
    }
}

#[derive(Clone, Copy)]
struct SampleFormat {
    channels: usize,
    sample_rate: u32,
    is_float: bool,
    bytes_per_sample: usize,
}

impl SampleFormat {
    fn is_decodable(&self, bits_per_sample: u16) -> bool {
        if !bits_per_sample.is_multiple_of(BITS_PER_BYTE) {
            return false;
        }
        matches!(
            (self.is_float, self.bytes_per_sample),
            (true, FLOAT_SAMPLE_BYTES) | (false, INT16_SAMPLE_BYTES | INT32_SAMPLE_BYTES)
        )
    }

    fn spec(&self) -> StreamSpec {
        StreamSpec {
            sample_rate: self.sample_rate,
            channels: self.channels,
        }
    }

    fn matches(&self, spec: &StreamSpec) -> bool {
        self.sample_rate == spec.sample_rate && self.channels == spec.channels
    }
}

fn read_sample_format(mix: *const WAVEFORMATEX) -> (SampleFormat, u16) {
    let base = unsafe { std::ptr::read_unaligned(mix) };
    let is_float = if base.wFormatTag as u32 == WAVE_FORMAT_EXTENSIBLE {
        let extensible = mix as *const WAVEFORMATEXTENSIBLE;
        let sub_format = unsafe { std::ptr::addr_of!((*extensible).SubFormat).read_unaligned() };
        sub_format == KSDATAFORMAT_SUBTYPE_IEEE_FLOAT
    } else {
        base.wFormatTag as u32 == WAVE_FORMAT_IEEE_FLOAT
    };
    let format = SampleFormat {
        channels: base.nChannels as usize,
        sample_rate: base.nSamplesPerSec,
        is_float,
        bytes_per_sample: (base.wBitsPerSample / BITS_PER_BYTE) as usize,
    };
    (format, base.wBitsPerSample)
}

struct MixFormat(*mut WAVEFORMATEX);

impl Drop for MixFormat {
    fn drop(&mut self) {
        unsafe { CoTaskMemFree(Some(self.0 as *const _)) };
    }
}

/// Activates the endpoint and reads its mix format.
///
/// The `MixFormat` guard is handed back rather than dropped here because
/// `start_client` needs the very pointer `Initialize` takes: it used to call
/// `GetMixFormat` a second time on the client this function had already asked,
/// which is two COM allocations and two round trips per open — once a second
/// while the capture is stalled. Callers that only want the format bind it to
/// `_mix` and let it free at the end of their scope, exactly as before.
fn activate_client(
    device: &IMMDevice,
) -> Result<(IAudioClient, SampleFormat, MixFormat), CaptureError> {
    let client: IAudioClient =
        unsafe { device.Activate(CLSCTX_ALL, None) }.map_err(backend_error)?;
    let mix = MixFormat(unsafe { client.GetMixFormat() }.map_err(backend_error)?);
    let (format, bits_per_sample) = read_sample_format(mix.0);
    if !format.is_decodable(bits_per_sample) {
        return Err(CaptureError::Backend(format!(
            "неподдерживаемый формат устройства вывода: {bits_per_sample} бит, float={}",
            format.is_float
        )));
    }
    Ok((client, format, mix))
}

pub struct Backend;

impl CaptureBackend for Backend {
    type Source = Source;
    type Running = Running;

    fn open(
        kind: SourceKind,
        device_uid: Option<&str>,
    ) -> Result<(Self::Source, StreamSpec), CaptureError> {
        open(kind, device_uid)
    }

    fn start(source: Self::Source, ctx: Box<CallbackCtx>) -> Result<Self::Running, CaptureError> {
        start(source, ctx)
    }

    fn list_devices(kind: SourceKind) -> Vec<AudioDeviceInfo> {
        list_devices(kind)
    }

    fn watch_default_output_device(on_change: DeviceChangeHandler) {
        watch_default_output_device(on_change);
    }
}

pub struct Source {
    device_id: String,
    kind: SourceKind,
}

pub struct Running {
    stop: Arc<AtomicBool>,
}

impl Drop for Running {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Release);
    }
}

pub fn open(
    kind: SourceKind,
    device_uid: Option<&str>,
) -> Result<(Source, StreamSpec), CaptureError> {
    let _com = ComGuard::enter()?;
    let enumerator = enumerator()?;
    let device = resolve_device(&enumerator, device_uid, kind)?;
    let source = Source {
        device_id: device_id(&device)?,
        kind,
    };
    let (_client, format, _mix) = activate_client(&device)?;
    Ok((source, format.spec()))
}

pub fn start(source: Source, ctx: Box<CallbackCtx>) -> Result<Running, CaptureError> {
    let stop = Arc::new(AtomicBool::new(false));
    let (ready_tx, ready_rx) = mpsc::channel::<Result<(), CaptureError>>();
    let spec = StreamSpec {
        sample_rate: ctx.shared.sample_rate,
        channels: ctx.shared.channels,
    };
    let thread_stop = Arc::clone(&stop);
    std::thread::Builder::new()
        .name(CAPTURE_THREAD_NAME.into())
        .spawn(move || capture_main(source, ctx, spec, thread_stop, ready_tx))
        .map_err(|e| CaptureError::Audio(e.to_string()))?;

    let started = ready_rx.recv_timeout(START_TIMEOUT);
    if let Ok(Ok(())) = started {
        return Ok(Running { stop });
    }
    stop.store(true, Ordering::Release);
    match started {
        Ok(Err(e)) => Err(e),
        _ => Err(CaptureError::Backend(
            "поток захвата не запустился".to_string(),
        )),
    }
}

/// The auto-reset event WASAPI signals when a packet is ready.
///
/// A guard rather than a bare `HANDLE` because the handle has to be closed on
/// every way out of `start_client` — a refused `Initialize`, a refused
/// `SetEventHandle`, a failed `GetService`, a failed `Start` — as well as on
/// every way out of the capture thread. `Drop` is the only thing that covers
/// all of them without a leak on one forgotten branch.
struct EventHandle(HANDLE);

impl EventHandle {
    /// `CreateEvent(nullptr, FALSE, FALSE, nullptr)`: unnamed, auto-reset and
    /// initially unsignalled — the shape `IAudioClient::SetEventHandle` asks for.
    /// Auto-reset matters: the wait itself has to consume the signal, otherwise
    /// the loop would spin on a permanently hot handle.
    fn create() -> Result<Self, CaptureError> {
        unsafe { CreateEventW(None, false, false, PCWSTR::null()) }
            .map(Self)
            .map_err(backend_error)
    }
}

impl Drop for EventHandle {
    fn drop(&mut self) {
        unsafe { CloseHandle(self.0) }.ok();
    }
}

/// How the capture thread finds out that a packet is waiting.
enum Wake {
    /// The audio engine signals this event once per device period.
    Event(EventHandle),
    /// The engine says nothing and the thread times its own wakeups. This is
    /// the behaviour that predates the event, kept as the fallback: drivers and
    /// shared-mode configurations exist that refuse an event handle outright,
    /// and a user on one of them must still be able to record.
    Poll,
}

struct LoopbackStream {
    client: IAudioClient,
    capture: IAudioCaptureClient,
    format: SampleFormat,
    /// Declared after both COM interfaces on purpose. `Drop` runs the explicit
    /// `Stop()` first and then drops the fields in declaration order, so the
    /// audio client is released before `CloseHandle` runs on the very event it
    /// was signalling.
    wake: Wake,
    poll_interval: Duration,
    /// `poll_interval` in whole milliseconds, computed once at open time:
    /// `WaitForSingleObject` takes a `u32`, and the conversion has no business
    /// on the per-packet path. `MIN_POLL_INTERVAL` is what keeps it at 2 or
    /// above — a zero timeout would make the wait a spin rather than a park.
    wait_millis: u32,
}

impl Drop for LoopbackStream {
    fn drop(&mut self) {
        unsafe { self.client.Stop() }.ok();
    }
}

impl LoopbackStream {
    /// Parks the capture thread until the next packet — or until the timeout.
    ///
    /// The timeout is not a formality, and it is deliberately the same interval
    /// the thread used to sleep for. Two reasons, both load-bearing:
    ///
    /// * **A loopback stream is signalled only while something renders to the
    ///   device.** With nothing playing the event never fires at all, and
    ///   `Timeline` still has to synthesise silence by wall clock — so the loop
    ///   must keep turning at the old cadence, or `recording_secs()` stops
    ///   advancing and five seconds of push-to-talk in a silent room become
    ///   "the recording is too short". This is the same fact that used to be the
    ///   argument for polling; it is an argument for a *timeout*, not against
    ///   the event.
    /// * **A wedged device must not pin the thread.** A driver that stops
    ///   signalling after a mode switch would otherwise hold this thread
    ///   forever, and `Running::drop` waits for the loop to notice the stop flag.
    ///
    /// What the event buys is therefore not the cadence of the wakeups but their
    /// *phase*: when audio really is flowing the thread is released the instant
    /// the packet lands instead of up to a full interval later, and that margin
    /// is what keeps the client buffer from wrapping under load.
    fn wait_for_data(&self) {
        let Wake::Event(event) = &self.wake else {
            std::thread::sleep(self.poll_interval);
            return;
        };
        let status = unsafe { WaitForSingleObject(event.0, self.wait_millis) };
        if status != WAIT_OBJECT_0 && status != WAIT_TIMEOUT {
            // WAIT_FAILED would otherwise turn this loop into a spin: sleeping
            // degrades it to the polling cadence, which the reopen path above
            // can still recover from.
            std::thread::sleep(self.poll_interval);
        }
    }
}

/// Half the device period, clamped — the cadence the capture loop turns at.
///
/// It is both the sleep of the polling fallback and the timeout of the
/// event-driven wait, on purpose: keeping the two identical means the silence
/// `Timeline` synthesises arrives in the same sized pieces whichever mode the
/// device granted, so switching modes cannot change what lands in the ring.
fn poll_interval(client: &IAudioClient) -> Duration {
    let mut default_period: i64 = 0;
    if unsafe { client.GetDevicePeriod(Some(&mut default_period), None) }.is_err() {
        return MAX_POLL_INTERVAL;
    }
    let nanos = (default_period as u64).saturating_mul(100) / 2;
    Duration::from_nanos(nanos).clamp(MIN_POLL_INTERVAL, MAX_POLL_INTERVAL)
}

fn stream_flags(kind: SourceKind) -> u32 {
    match kind {
        SourceKind::Output => AUDCLNT_STREAMFLAGS_LOOPBACK,
        SourceKind::Input => 0,
    }
}

/// Initialises one activated client and starts the flow of packets.
///
/// `event_driven` decides whether `AUDCLNT_STREAMFLAGS_EVENTCALLBACK` is asked
/// for. The client is taken **by value** because `IAudioClient::Initialize` may
/// be called exactly once per client: an attempt that fails has spent its
/// client, so the caller has to activate a fresh one before trying the other
/// mode.
fn start_client(
    client: IAudioClient,
    format: SampleFormat,
    mix: &MixFormat,
    kind: SourceKind,
    event_driven: bool,
) -> Result<LoopbackStream, CaptureError> {
    let buffer_duration = (CLIENT_BUFFER_SECONDS * REFERENCE_TIMES_PER_SECOND as f64) as i64;
    let mut flags = stream_flags(kind);
    // The handle is created before `Initialize` so that a refusal of either half
    // takes the same exit: `wake` is a local, and `?` drops it.
    let wake = if event_driven {
        flags |= AUDCLNT_STREAMFLAGS_EVENTCALLBACK;
        Wake::Event(EventHandle::create()?)
    } else {
        Wake::Poll
    };
    // Periodicity stays 0: in shared mode the engine owns the period, and a
    // non-zero value there is what `AUDCLNT_E_INVALID_DEVICE_PERIOD` is for.
    unsafe {
        client.Initialize(
            AUDCLNT_SHAREMODE_SHARED,
            flags,
            buffer_duration,
            0,
            mix.0,
            None,
        )
    }
    .map_err(backend_error)?;
    // The order is fixed by WASAPI — Initialize, then the handle, then Start.
    // Starting an EVENTCALLBACK stream that never got one fails with
    // AUDCLNT_E_EVENTHANDLE_NOT_SET.
    if let Wake::Event(event) = &wake {
        unsafe { client.SetEventHandle(event.0) }.map_err(backend_error)?;
    }
    let capture: IAudioCaptureClient = unsafe { client.GetService() }.map_err(backend_error)?;
    let poll_interval = poll_interval(&client);
    let stream = LoopbackStream {
        client,
        capture,
        format,
        wake,
        poll_interval,
        wait_millis: poll_interval.as_millis() as u32,
    };
    // Started last, and through the assembled stream, so that a refusal here
    // still unwinds through `Drop`: `Stop()` on the client, `CloseHandle` on the
    // event.
    unsafe { stream.client.Start() }.map_err(backend_error)?;
    Ok(stream)
}

/// Activates a client whose mix format still matches the frozen stream spec.
///
/// The check rides on the activation rather than sitting in `start_client`
/// because every attempt needs it: the fallback below activates a second client,
/// and a spec mismatch that only the first attempt tested for would run the
/// stream at a sample rate the ring and the resampler are not sized for.
///
/// The returned `MixFormat` must outlive the `Initialize` that consumes its
/// pointer; it is the format this call already read, not a second
/// `GetMixFormat`.
fn activate_matching(
    device: &IMMDevice,
    spec: &StreamSpec,
) -> Result<(IAudioClient, SampleFormat, MixFormat), CaptureError> {
    let (client, format, mix) = activate_client(device)?;
    if !format.matches(spec) {
        return Err(CaptureError::Backend(
            "формат устройства захвата изменился — захват пересоздаётся".to_string(),
        ));
    }
    Ok((client, format, mix))
}

/// Opens the endpoint and starts it, preferring the event-driven mode.
///
/// **Why the fallback exists.** Event mode is a request, not a guarantee: a
/// driver, or a particular shared-mode configuration, can refuse
/// `EVENTCALLBACK` at `Initialize` or refuse the handle at `SetEventHandle`.
/// Dropping to polling costs the scheduling margin and nothing else — the
/// packets, the decode and the accounting are byte-for-byte the same — whereas
/// failing the open would leave that user unable to record at all.
///
/// `fallback_reported` is the caller's latch. This function runs once per
/// reopen, which is once a second for as long as a device is stalled, and a
/// driver that refuses the event refuses it every time; without the latch the
/// notice would repeat for the life of the recording.
fn open_stream(
    enumerator: &IMMDeviceEnumerator,
    device_id: &str,
    kind: SourceKind,
    spec: &StreamSpec,
    fallback_reported: &mut bool,
) -> Result<LoopbackStream, CaptureError> {
    let device = device_by_id(enumerator, device_id)?;
    let (client, format, mix) = activate_matching(&device, spec)?;
    match start_client(client, format, &mix, kind, true) {
        Ok(stream) => Ok(stream),
        // A permission refusal is about the endpoint, not about the event: the
        // second attempt would fail identically, and calling it a fallback in
        // the log would be a lie.
        Err(denied @ CaptureError::PermissionDenied) => Err(denied),
        Err(refusal) => {
            if !*fallback_reported {
                *fallback_reported = true;
                eprintln!(
                    "устройство не приняло событийный режим WASAPI, захват идёт опросом: {refusal}"
                );
            }
            let (client, format, mix) = activate_matching(&device, spec)?;
            start_client(client, format, &mix, kind, false)
        }
    }
}

/// Decodes one WASAPI packet into `out`.
///
/// `is_float` and `bytes_per_sample` are frozen for the life of the stream, so
/// the match sits outside the loop rather than inside it: the loop body ran
/// 96 000 times a second at 48 kHz stereo on the capture thread, re-deciding the
/// same branch every time and re-checking `Vec` capacity on every `push`.
///
/// The float case does not decode at all — a little-endian `f32` on the wire is
/// bit-identical to the destination element — so it is a single `memcpy`. The
/// integer cases keep exactly the alignment assumption the pointer reads made:
/// `from_ne_bytes` over a byte chunk is the same unaligned, native-endian load
/// `read_unaligned` performed. `SampleFormat::is_decodable` has already rejected
/// anything that is not `(float, 4)`, `(int, 2)` or `(int, 4)` at activation
/// time, which is why the last arm is the 32-bit integer one.
fn decode_samples(out: &mut Vec<f32>, data: *const u8, frames: usize, format: SampleFormat) {
    let count = frames * format.channels;
    out.clear();
    out.reserve(count);
    let bytes = unsafe { std::slice::from_raw_parts(data, count * format.bytes_per_sample) };
    match (format.is_float, format.bytes_per_sample) {
        (true, FLOAT_SAMPLE_BYTES) => unsafe {
            // `out` was just cleared and reserved for `count` elements, so the
            // destination holds `count * 4` bytes and the copy cannot overrun.
            std::ptr::copy_nonoverlapping(data, out.as_mut_ptr().cast::<u8>(), bytes.len());
            out.set_len(count);
        },
        (false, INT16_SAMPLE_BYTES) => out.extend(
            bytes
                .chunks_exact(INT16_SAMPLE_BYTES)
                .map(|s| f32::from(i16::from_ne_bytes([s[0], s[1]])) / I16_SCALE),
        ),
        _ => out.extend(
            bytes
                .chunks_exact(INT32_SAMPLE_BYTES)
                .map(|s| i32::from_ne_bytes([s[0], s[1], s[2], s[3]]) as f32 / I32_SCALE),
        ),
    }
}

struct Timeline {
    sample_rate: u32,
    channels: usize,
    opened_at: Option<Instant>,
    frames: u64,
}

impl Timeline {
    fn new(spec: &StreamSpec) -> Self {
        Self {
            sample_rate: spec.sample_rate,
            channels: spec.channels,
            opened_at: None,
            frames: 0,
        }
    }

    fn gate(&mut self, wants_samples: bool) {
        if !wants_samples {
            self.opened_at = None;
            return;
        }
        if self.opened_at.is_none() {
            self.opened_at = Some(Instant::now());
            self.frames = 0;
        }
    }

    fn on_frames(&mut self, frames: usize) {
        self.frames += frames as u64;
    }

    fn missing_frames(&self) -> usize {
        let Some(opened_at) = self.opened_at else {
            return 0;
        };
        let expected = (opened_at.elapsed().as_secs_f64() * f64::from(self.sample_rate)) as u64;
        expected.saturating_sub(self.frames) as usize
    }

    fn samples_for(&self, frames: usize) -> usize {
        frames * self.channels
    }
}

fn drain_packets(
    stream: &LoopbackStream,
    ctx: &mut CallbackCtx,
    scratch: &mut Vec<f32>,
    stop: &AtomicBool,
) -> Result<usize, CaptureError> {
    let mut delivered = 0usize;
    while !stop.load(Ordering::Acquire) {
        let available = unsafe { stream.capture.GetNextPacketSize() }.map_err(backend_error)?;
        if available == 0 {
            return Ok(delivered);
        }
        let mut data: *mut u8 = std::ptr::null_mut();
        let mut frames: u32 = 0;
        let mut flags: u32 = 0;
        unsafe {
            stream
                .capture
                .GetBuffer(&mut data, &mut frames, &mut flags, None, None)
        }
        .map_err(backend_error)?;

        let silent = flags & AUDCLNT_BUFFERFLAGS_SILENT.0 as u32 != 0;
        if frames > 0 && ctx.wants_samples() {
            if silent || data.is_null() {
                scratch.clear();
                scratch.resize(frames as usize * stream.format.channels, 0.0);
            } else {
                decode_samples(scratch, data, frames as usize, stream.format);
            }
            ctx.push_samples(scratch);
        }
        delivered += frames as usize;

        unsafe { stream.capture.ReleaseBuffer(frames) }.map_err(backend_error)?;
        if frames == 0 {
            return Ok(delivered);
        }
    }
    Ok(delivered)
}

fn push_silence(ctx: &mut CallbackCtx, scratch: &mut Vec<f32>, samples: usize) {
    scratch.clear();
    scratch.resize(samples, 0.0);
    ctx.push_samples(scratch);
}

fn run_stream(
    stream: &LoopbackStream,
    ctx: &mut CallbackCtx,
    mut timeline: Option<&mut Timeline>,
    stop: &AtomicBool,
) -> Result<(), CaptureError> {
    let mut scratch: Vec<f32> = Vec::new();
    while !stop.load(Ordering::Acquire) {
        let wants_samples = ctx.wants_samples();
        if let Some(timeline) = timeline.as_deref_mut() {
            timeline.gate(wants_samples);
        }
        let delivered = drain_packets(stream, ctx, &mut scratch, stop)?;
        if let Some(timeline) = timeline.as_deref_mut() {
            timeline.on_frames(delivered);
            if wants_samples && delivered == 0 {
                let missing = timeline.missing_frames();
                if missing > 0 {
                    push_silence(ctx, &mut scratch, timeline.samples_for(missing));
                    timeline.on_frames(missing);
                }
            }
        }
        stream.wait_for_data();
    }
    Ok(())
}

fn capture_main(
    source: Source,
    mut ctx: Box<CallbackCtx>,
    spec: StreamSpec,
    stop: Arc<AtomicBool>,
    ready: mpsc::Sender<Result<(), CaptureError>>,
) {
    let Ok(_com) = ComGuard::enter() else {
        let _ = ready.send(Err(CaptureError::Backend(
            "COM недоступен в потоке захвата".to_string(),
        )));
        return;
    };
    // MMCSS is a property of the thread, not of a stream, so it is joined once
    // here and reverted when the thread unwinds. Declared after `_com` and
    // before `enumerator`, which makes the drop order
    // enumerator → MMCSS → apartment.
    let _mmcss = MmcssGuard::enter();
    // One enumerator for the life of the capture thread instead of a
    // `CoCreateInstance` per open: the stall path below reopens once a second,
    // and `watch_default_output_device` already keeps one for the life of the
    // process. It is created after the `ComGuard` and, being a later local, is
    // released before it — which is the order COM requires.
    let enumerator = match enumerator() {
        Ok(enumerator) => enumerator,
        Err(e) => {
            let _ = ready.send(Err(e));
            return;
        }
    };
    // Synthesised silence is a loopback-only need: loopback emits no packets while
    // nothing renders to the device. A real capture endpoint always delivers packets,
    // so zero-filling there would double-count samples.
    let mut timeline = (source.kind == SourceKind::Output).then(|| Timeline::new(&spec));
    let mut announced = false;
    // Latched for the life of the thread; see `open_stream`.
    let mut fallback_reported = false;

    while !stop.load(Ordering::Acquire) {
        match open_stream(
            &enumerator,
            &source.device_id,
            source.kind,
            &spec,
            &mut fallback_reported,
        ) {
            Ok(stream) => {
                ctx.shared.stalled.store(false, Ordering::Release);
                if !announced {
                    announced = true;
                    let _ = ready.send(Ok(()));
                }
                if let Err(e) = run_stream(&stream, &mut ctx, timeline.as_mut(), &stop) {
                    eprintln!("поток захвата прерван, переоткрываю: {e}");
                }
            }
            Err(e) => {
                if !announced {
                    let _ = ready.send(Err(e));
                    return;
                }
                // Retrying alone is not enough: a changed mix format (a new sample rate on
                // the endpoint, a headset that switched profile) fails `format.matches(spec)`
                // on EVERY reopen — the spec is frozen at `AudioCapture::new`. Without the
                // flag the thread spins here once a second forever and the app records pure
                // silence with nothing in the UI to show for it.
                ctx.shared.stalled.store(true, Ordering::Release);
                eprintln!("не удалось переоткрыть захват: {e}");
            }
        }
        if stop.load(Ordering::Acquire) {
            return;
        }
        std::thread::sleep(REOPEN_DELAY);
    }
}
