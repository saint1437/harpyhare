//! Захват системного звука macOS через Core Audio process tap.
//!
//! Схема (терминология Apple):
//! `CATapDescription` (глобальный стерео-микс, исключений нет)
//! -> `AudioHardwareCreateProcessTap`
//! -> приватный aggregate device со списком `TapList=[tap]`
//! -> `AudioDeviceCreateIOProcID` на aggregate
//! -> в IO-колбэке (поток Core Audio) кладём интерливленные f32-фреймы в lock-free
//!    ring buffer (без мьютексов и аллокаций — RT-безопасно)
//! -> поток-консьюмер на лету даунмиксит в моно, ресемплит в 16кГц, копит итоговый
//!    буфер и (опционально) отдаёт свежие 16кГц-чанки в [`ChunkSink`] — так работает
//!    стриминговая загрузка в STT прямо во время записи.
//!
//! Tap, aggregate, IO-proc и консьюмер создаются один раз в [`SystemAudioCapture::new`]
//! и живут, пока жив объект. IO-proc крутится постоянно; накопление сэмплов
//! включается/выключается флагом [`Shared::recording`], которым управляет только
//! консьюмер (это исключает гонку «stop до того, как консьюмер проснулся»).

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Condvar, Mutex};

use cidre::{
    cat, cf,
    core_audio::{self as ca, aggregate_device_keys as agg_keys, sub_device_keys as sub_keys},
    ns, os,
};
use ringbuf::traits::{Consumer, Producer, Split};
use ringbuf::{HeapCons, HeapProd, HeapRb};

use crate::audio;

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
    /// Маппинг OSStatus-ошибки cidre в нашу ошибку.
    ///
    /// Достоверно различить «нет TCC-разрешения» по коду тяжело: при отказе
    /// `AudioHardwareCreateProcessTap`/старте устройства Core Audio чаще всего
    /// возвращает `kAudioHardwareIllegalOperationError` (FourCC `'!hog'`, 561211751).
    /// Этот код трактуем как [`CaptureError::PermissionDenied`]; всё остальное —
    /// [`CaptureError::CoreAudio`] с человекочитаемым описанием (raw + FourCC).
    fn from_os(err: os::Error) -> Self {
        const ILLEGAL_OPERATION: i32 = i32::from_be_bytes(*b"!hog"); // 561211751
        if err.0.get() == ILLEGAL_OPERATION {
            CaptureError::PermissionDenied
        } else {
            CaptureError::CoreAudio(format!("{err}"))
        }
    }
}

/// Приёмник 16кГц-моно чанков по мере записи (стриминговая загрузка в STT).
/// Вызывается из потока-консьюмера; дропается им же по окончании записи —
/// это сигнал «тело потока завершено» для получателя.
pub type ChunkSink = Box<dyn FnMut(&[f32]) + Send>;

/// Запас кольца: ~8 секунд стерео 48кГц. Консьюмер дренирует каждые ~5мс,
/// так что заполнение кольца — признак серьёзно застрявшего консьюмера.
const RING_SECONDS: usize = 8;

/// Команды/состояние сессии записи (протокол между start/stop и консьюмером).
enum Session {
    Idle,
    /// start() положил sink и просит консьюмер начать новую запись.
    Start(Option<ChunkSink>),
    /// Консьюмер записывает (флаг recording взведён им самим).
    Running,
    /// Готовый результат для stop(): 16кГц-моно либо ошибка обработки.
    Done(Result<Vec<f32>, String>),
}

/// Состояние, разделяемое между RT-колбэком, консьюмером и start/stop.
struct Shared {
    /// Гейт для RT-колбэка. Выставляет ТОЛЬКО консьюмер.
    recording: AtomicBool,
    /// Просьба завершить запись (выставляет stop(); консьюмер реагирует).
    stop_requested: AtomicBool,
    /// Интерливленных сэмплов принято в кольцо за текущую запись (для recording_secs).
    produced: AtomicU64,
    /// Потеряно на переполнении кольца (диагностика; в норме 0).
    dropped: AtomicU64,
    sample_rate: u32,
    channels: usize,
    session: Mutex<Session>,
    cv: Condvar,
}

/// Контекст, адрес которого передаётся в C-колбэк как `client_data`.
///
/// Лежит в `Box` внутри [`SystemAudioCapture`], поэтому его адрес стабилен на всё
/// время жизни IO-proc'а. Держит продюсерскую половину кольца — push из RT-потока
/// лок-фри и без аллокаций.
struct CallbackCtx {
    shared: Arc<Shared>,
    prod: HeapProd<f32>,
}

pub struct SystemAudioCapture {
    shared: Arc<Shared>,
    // Порядок полей задаёт порядок drop'а (поля дропаются в порядке объявления).
    // `_started` владеет самим `AggregateDevice` (через ManuallyDrop) и при drop'е
    // сначала останавливает IO (AudioDeviceStop), затем уничтожает aggregate.
    // Потом дропается tap, и только в самом конце — `_ctx`, на который ссылается
    // колбэк. Такой порядок исключает use-after-free в IO-потоке.
    _started: ca::hardware::StartedDevice<ca::AggregateDevice>,
    _tap: ca::TapGuard,
    _ctx: Box<CallbackCtx>,
}

// SAFETY: все поля фактически Send — raw AudioObjectID = u32, Arc<Shared> (Shared: Send+Sync).
// ВНИМАНИЕ: явный impl ОТКЛЮЧАЕТ авто-проверку компилятора — при добавлении не-Send поля
// (raw-указатель, Cell и т.п.) ошибки сборки НЕ будет; пересмотри этот impl вручную.
// Вызывающий обязан держать SystemAudioCapture под Mutex — &mut-доступ не синхронизирован.
unsafe impl Send for SystemAudioCapture {}

impl SystemAudioCapture {
    /// Создаёт process tap на весь системный вывод + приватный aggregate device,
    /// регистрирует постоянно работающий IO-proc и поднимает поток-консьюмер.
    /// Первый вызов триггерит системный диалог разрешения (TCC, «Audio Recording»).
    pub fn new() -> Result<Self, CaptureError> {
        // 1. Описание глобального стерео-tap'а без исключений процессов.
        let tap_desc = ca::TapDesc::with_stereo_global_tap_excluding_processes(&ns::Array::new());

        // 2. Создаём сам tap. Именно тут прилетает отказ TCC, если разрешения нет.
        let tap = tap_desc
            .create_process_tap()
            .map_err(CaptureError::from_os)?;
        let tap_uid = tap.uid().map_err(CaptureError::from_os)?;

        // 3. Формат потока tap'а: интерливленный f32. Узнаём rate/channels.
        let asbd = tap.asbd().map_err(CaptureError::from_os)?;

        // Ассерт инвариантов, которые предполагает IO-колбэк: буфер читается как
        // interleaved f32. Если tap вернул неожиданный формат — лучше ошибка здесь,
        // чем молчаливая порча данных в io_proc.
        // Флаги: cat::audio::FormatFlags::IS_FLOAT (1<<0), IS_NON_INTERLEAVED (1<<5).
        if !asbd.format_flags.contains(cat::audio::FormatFlags::IS_FLOAT)
            || asbd.format_flags.contains(cat::audio::FormatFlags::IS_NON_INTERLEAVED)
            || asbd.bits_per_channel != 32
        {
            return Err(CaptureError::CoreAudio(format!(
                "неожиданный формат tap: format_flags={:#010x}, bits_per_channel={}",
                asbd.format_flags.0, asbd.bits_per_channel
            )));
        }

        let sample_rate = asbd.sample_rate as u32;
        let channels = asbd.channels_per_frame as usize;

        // 4. Главный sub-device aggregate'а — дефолтный системный вывод (нужен как
        //    источник тактирования). На приёме нас интересует только tap.
        let output_device = ca::System::default_output_device().map_err(CaptureError::from_os)?;
        let output_uid = output_device.uid().map_err(CaptureError::from_os)?;
        let sub_device =
            cf::DictionaryOf::with_keys_values(&[sub_keys::uid()], &[output_uid.as_type_ref()]);
        let sub_tap =
            cf::DictionaryOf::with_keys_values(&[sub_keys::uid()], &[tap_uid.as_type_ref()]);

        // 5. Конфиг приватного aggregate'а с нашим tap'ом в TapList.
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
                cf::str!(c"itech-system-audio-tap"),
                &output_uid,
                &cf::Uuid::new().to_cf_string(),
                &cf::ArrayOf::from_slice(&[sub_device.as_ref()]),
                &cf::ArrayOf::from_slice(&[sub_tap.as_ref()]),
            ],
        );
        let agg_device = ca::AggregateDevice::with_desc(&dict).map_err(CaptureError::from_os)?;

        // 6. Кольцо + разделяемое состояние.
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

        // 7. Поток-консьюмер: живёт всё время работы приложения.
        {
            let shared = Arc::clone(&shared);
            std::thread::Builder::new()
                .name("audio-consumer".into())
                .spawn(move || consumer_main(&shared, cons))
                .map_err(|e| CaptureError::Audio(e.to_string()))?;
        }

        // 8. Регистрируем IO-proc и сразу запускаем устройство — proc крутится постоянно.
        // SAFETY: `ctx` живёт в self (`_ctx`) дольше, чем `_started`, который при drop'е
        // первым останавливает IO. Значит на момент любого вызова `io_proc` ctx валиден.
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

    /// Начать запись. `sink`, если задан, получает 16кГц-моно чанки по мере записи
    /// и дропается по её окончании (сигнал EOF для стриминговой загрузки).
    pub fn start(&mut self, sink: Option<ChunkSink>) -> Result<(), CaptureError> {
        self.shared.stop_requested.store(false, Ordering::Release);
        let mut s = self.shared.session.lock().unwrap();
        *s = Session::Start(sink);
        self.shared.cv.notify_all();
        Ok(())
    }

    /// Остановить запись и забрать готовый 16кГц-моно буфер (ресемплинг уже сделан
    /// консьюмером на лету; здесь остаётся дождаться дрена хвоста — миллисекунды).
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
                Session::Idle => return Ok(Vec::new()), // stop без start
                _ => {
                    let (guard, timeout) = self
                        .shared
                        .cv
                        .wait_timeout(s, std::time::Duration::from_secs(5))
                        .unwrap();
                    s = guard;
                    if timeout.timed_out() {
                        return Err(CaptureError::Audio(
                            "консьюмер не завершил запись за 5с".into(),
                        ));
                    }
                }
            }
        }
    }

    /// Длительность текущей записи в секундах (по числу принятых в кольцо сэмплов).
    pub fn recording_secs(&self) -> f32 {
        let samples = self.shared.produced.load(Ordering::Relaxed);
        let frames = samples / self.shared.channels.max(1) as u64;
        frames as f32 / self.shared.sample_rate.max(1) as f32
    }
}

/// Тело потока-консьюмера: одна итерация внешнего цикла = одна запись.
fn consumer_main(shared: &Shared, mut ring: HeapCons<f32>) {
    // Скретч-буферы переживают сессии — аллокации только на рост.
    let mut raw: Vec<f32> = Vec::with_capacity(32 * 1024);
    let mut mono: Vec<f32> = Vec::with_capacity(16 * 1024);
    let mut read_buf = vec![0f32; 16 * 1024];

    loop {
        // Ждём команду Start (sink забираем себе).
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

        // Сброс перед записью: выкидываем возможные остатки из кольца
        // (recording ещё false — новых сэмплов не появится), обнуляем счётчики.
        while ring.pop_slice(&mut read_buf) > 0 {}
        raw.clear();
        shared.produced.store(0, Ordering::Relaxed);
        shared.dropped.store(0, Ordering::Relaxed);

        let mut resampler = audio::StreamResampler::new(shared.sample_rate);
        let mut out: Vec<f32> = Vec::with_capacity(audio::TARGET_SAMPLE_RATE as usize * 30);
        let mut failure: Option<String> = None;

        // Поехали: с этого момента RT-колбэк начинает наполнять кольцо.
        shared.recording.store(true, Ordering::Release);

        loop {
            let stopping = shared.stop_requested.load(Ordering::Acquire);
            if stopping {
                // Сначала перекрываем кран, потом дренируем хвост.
                shared.recording.store(false, Ordering::Release);
            }
            let n = ring.pop_slice(&mut read_buf);
            if n > 0 {
                if failure.is_none() {
                    // Копим по целым фреймам: pop мог разрезать фрейм посередине.
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
                continue; // в кольце могло остаться ещё — дочитываем без сна
            }
            if stopping {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(5));
        }

        // Финальный флаш ресемплера (хвост меньше чанка + компенсация задержки).
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
        // Дроп sink'а = EOF для стриминговой загрузки.
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

/// IO-колбэк Core Audio. Вызывается из реального аудиопотока — лок-фри push в кольцо,
/// никаких мьютексов и аллокаций.
///
/// SAFETY / инварианты:
/// - `ctx` указывает на `CallbackCtx` внутри `Box`, который живёт в `SystemAudioCapture`
///   и освобождается строго ПОСЛЕ остановки IO (см. порядок полей в структуре).
/// - tap отдаёт интерливленный f32 (kAudioTapPropertyFormat), поэтому в `buffers[0]`
///   лежит непрерывный массив `data_bytes_size / 4` значений `f32`.
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

    // Гейт: пока не идёт запись — просто выходим (звук уходит в /dev/null).
    if !shared.recording.load(Ordering::Acquire) {
        return os::Status::NO_ERR;
    }

    let abuf = &input_data.buffers[0];
    if abuf.data.is_null() || abuf.data_bytes_size == 0 {
        return os::Status::NO_ERR;
    }

    // SAFETY: tap-формат — f32; `data` указывает на `data_bytes_size` валидных байт,
    // принадлежащих Core Audio только на время этого вызова. Копируем их в кольцо.
    debug_assert_eq!(abuf.data_bytes_size % 4, 0); // ловит сюрприз формата в dev-сборке
    let n = abuf.data_bytes_size as usize / std::mem::size_of::<f32>();
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
