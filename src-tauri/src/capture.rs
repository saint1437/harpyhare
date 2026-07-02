//! Захват системного звука macOS через Core Audio process tap.
//!
//! Схема (терминология Apple):
//! `CATapDescription` (глобальный стерео-микс, исключений нет)
//! -> `AudioHardwareCreateProcessTap`
//! -> приватный aggregate device со списком `TapList=[tap]`
//! -> `AudioDeviceCreateIOProcID` на aggregate
//! -> в IO-колбэке (поток Core Audio) копируем интерливленные f32-фреймы в буфер.
//!
//! Tap, aggregate и IO-proc создаются один раз в [`SystemAudioCapture::new`] и живут,
//! пока жив объект. IO-proc крутится постоянно; накопление сэмплов включается/выключается
//! флагом [`Shared::recording`] из [`SystemAudioCapture::start`]/[`SystemAudioCapture::stop`].
//! Это избавляет от гонок старт/стоп самого устройства и от перерегистрации proc'а.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use cidre::{
    cat, cf,
    core_audio::{self as ca, aggregate_device_keys as agg_keys, sub_device_keys as sub_keys},
    ns, os,
};

#[derive(Debug, thiserror::Error)]
pub enum CaptureError {
    #[error("Нет разрешения на запись системного звука")]
    PermissionDenied,
    #[error("Core Audio: {0}")]
    CoreAudio(String),
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

/// Состояние, разделяемое между потоком Tauri (start/stop) и IO-потоком Core Audio.
///
/// `buf` пишется только из IO-колбэка и читается/очищается из start/stop под мьютексом.
/// `recording` — лёгкий гейт: пока он `false`, колбэк ничего не пишет.
struct Shared {
    buf: Mutex<Vec<f32>>,
    recording: AtomicBool,
    sample_rate: u32,
    channels: usize,
}

/// Контекст, адрес которого передаётся в C-колбэк как `client_data`.
///
/// Лежит в `Box` внутри [`SystemAudioCapture`], поэтому его адрес стабилен на всё
/// время жизни IO-proc'а. Хранит `Arc<Shared>`, чтобы безопасно дотянуться до буфера.
struct CallbackCtx {
    shared: Arc<Shared>,
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
// Вызывающий (Task 11) обязан держать SystemAudioCapture под Mutex — &mut-доступ не синхронизирован.
unsafe impl Send for SystemAudioCapture {}

impl SystemAudioCapture {
    /// Создаёт process tap на весь системный вывод + приватный aggregate device
    /// и регистрирует постоянно работающий IO-proc.
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

        // 6. Разделяемое состояние + контекст для колбэка (стабильный адрес в Box).
        let shared = Arc::new(Shared {
            buf: Mutex::new(Vec::new()),
            recording: AtomicBool::new(false),
            sample_rate,
            channels,
        });
        let mut ctx = Box::new(CallbackCtx {
            shared: Arc::clone(&shared),
        });

        // 7. Регистрируем IO-proc и сразу запускаем устройство — proc крутится постоянно.
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

    /// Начать копить сэмплы: очищает буфер и взводит флаг записи.
    pub fn start(&mut self) -> Result<(), CaptureError> {
        if let Ok(mut buf) = self.shared.buf.lock() {
            buf.clear();
            // Предвыделяем ~10с: первые расширения Vec не реаллоцируют буфер
            // из RT-колбэка Core Audio (дальше рост амортизированный и редкий).
            buf.reserve(self.shared.sample_rate as usize * self.shared.channels * 10);
        }
        self.shared.recording.store(true, Ordering::Release);
        Ok(())
    }

    /// Остановить накопление и забрать интерливленный буфер + (sample_rate, channels).
    pub fn stop(&mut self) -> (Vec<f32>, u32, usize) {
        // store(false) раньше lock. Колбэк, успевший пройти гейт до store, либо допишет
        // хвостовые фреймы до take (попадут в результат), либо после take — тогда эти
        // несколько фреймов осядут в пустом буфере и будут отброшены clear()-ом при
        // следующем start(). Потеря <1 мс хвоста для PTT несущественна.
        self.shared.recording.store(false, Ordering::Release);
        let buf = match self.shared.buf.lock() {
            Ok(mut b) => std::mem::take(&mut *b),
            Err(poisoned) => std::mem::take(&mut *poisoned.into_inner()),
        };
        (buf, self.shared.sample_rate, self.shared.channels)
    }

    /// Длительность текущей записи в секундах (len / rate / channels).
    pub fn recording_secs(&self) -> f32 {
        let len = match self.shared.buf.lock() {
            Ok(b) => b.len(),
            Err(p) => p.into_inner().len(),
        };
        let frames = len / self.shared.channels.max(1);
        frames as f32 / self.shared.sample_rate.max(1) as f32
    }
}

/// IO-колбэк Core Audio. Вызывается из реального аудиопотока — никаких блокировок надолго,
/// никаких аллокаций кроме возможного роста `Vec` под коротким `lock()`.
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
    // принадлежащих Core Audio только на время этого вызова. Копируем их в свой Vec.
    debug_assert_eq!(abuf.data_bytes_size % 4, 0); // ловит сюрприз формата в dev-сборке
    let n = abuf.data_bytes_size as usize / std::mem::size_of::<f32>();
    let samples = unsafe { std::slice::from_raw_parts(abuf.data as *const f32, n) };

    if let Ok(mut buf) = shared.buf.lock() {
        // Без верхней границы по дизайну: лимит 10 мин обеспечивает вызывающий
        // через recording_secs() (Task 11).
        buf.extend_from_slice(samples);
    }

    os::Status::NO_ERR
}
