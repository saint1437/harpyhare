use std::sync::atomic::Ordering;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager};

use crate::app_state::{build_mic_capture, current_settings, stt_engine, App};
use crate::error::{AppError, ErrorCode};
use crate::permissions::{self, PermissionKind};
use crate::{audio, auto, capture, events, recording, state};

/// Проверка слушает фиксированное окно: за пять секунд человек успевает сказать
/// фразу, а собеседник в звонке — договорить предложение.
const CHECK_SECS: u64 = 5;
const LEVEL_INTERVAL: Duration = Duration::from_millis(100);

const ERR_BUSY: &str = "Идёт запись — дождитесь её окончания";
const ERR_CHECK_RUNNING: &str = "Идёт проверка звука — дождитесь её окончания";

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum AudioSource {
    System,
    Microphone,
}

/// Разрешение «выдано» и звук «слышно» — разные вопросы, и второй до сих пор
/// никто не задавал: проверка отвечает именно на него, а `text` показывает, что
/// распознавание тоже дошло до Groq и вернулось.
#[derive(Debug, Clone, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AudioCheck {
    pub heard: bool,
    pub text: String,
}

pub fn is_active(app: &AppHandle) -> bool {
    app.state::<App>().audio_check_active.load(Ordering::Acquire)
}

pub fn busy_error() -> AppError {
    AppError::new(ErrorCode::Internal, ERR_CHECK_RUNNING)
}

/// The five-second check window is a busy state even though the recorder is
/// Idle: starting auto mode or PTT inside it armed a segmenter in the middle of
/// a foreign session, and stop_system then tore that session down. The slot is
/// RAII so a panic inside the command cannot leave the flag raised forever
/// (the same device as the screenshot's CaptureSlot).
struct CheckSlot(AppHandle);

impl CheckSlot {
    fn claim(app: &AppHandle) -> Result<Self, AppError> {
        let busy = app
            .state::<App>()
            .audio_check_active
            .swap(true, Ordering::AcqRel);
        if busy {
            return Err(busy_error());
        }
        Ok(Self(app.clone()))
    }
}

impl Drop for CheckSlot {
    fn drop(&mut self) {
        self.0
            .state::<App>()
            .audio_check_active
            .store(false, Ordering::Release);
    }
}

pub fn peak_level(samples: &[f32]) -> f32 {
    samples
        .iter()
        .fold(0.0_f32, |peak, s| peak.max(s.abs()))
        .min(1.0)
}

fn level_sink(app: AppHandle) -> capture::ChunkSink {
    let mut last: Option<Instant> = None;
    Box::new(move |chunk: &[f32]| {
        let now = Instant::now();
        if last.is_some_and(|prev| now.duration_since(prev) < LEVEL_INTERVAL) {
            return;
        }
        last = Some(now);
        events::audio_level(&app, peak_level(chunk));
    })
}

fn ensure_idle(app: &AppHandle) -> Result<(), AppError> {
    if auto::is_active(app) {
        return Err(auto::recorder_busy_error());
    }
    if *app.state::<App>().recorder.lock().unwrap() != state::RecorderState::Idle {
        return Err(AppError::new(ErrorCode::Internal, ERR_BUSY));
    }
    Ok(())
}

fn start_system(app: &AppHandle) -> Result<(), AppError> {
    // Проверка поднимает захват, а на macOS это и есть системный запрос доступа.
    // Он законен — его вызвало нажатие, — но отметку обязан оставить такую же,
    // как кнопка «Выдать»: иначе статус навсегда остался бы «не спрашивали».
    permissions::mark_requested(app, PermissionKind::Audio)
        .map_err(|e| AppError::new(ErrorCode::Internal, e))?;
    recording::ensure_capture_or_err(app)?;
    let buffer_enabled = current_settings(app).buffer_enabled;
    let st = app.state::<App>();
    let mut guard = st.capture.lock().unwrap();
    let Some(capture) = guard.as_mut() else {
        return Err(AppError::new(
            ErrorCode::Permission,
            recording::ERR_NO_SYSTEM_CAPTURE,
        ));
    };
    // Фоновый буфер выключается на время проверки: иначе в неё попал бы хвост,
    // записанный ДО нажатия, и «слышно» значило бы «было слышно когда-то».
    capture.set_buffering(false);
    if let Err(e) = capture.start(Some(level_sink(app.clone()))) {
        // Сорвавшийся старт обязан вернуть буфер сам: `stop_system` в этом случае
        // не вызовут, и преролл PTT остался бы выключенным до перезапуска — молча.
        capture.set_buffering(buffer_enabled);
        return Err(AppError::from(&e));
    }
    Ok(())
}

fn stop_system(app: &AppHandle) -> Result<Vec<f32>, AppError> {
    // Belt and braces: the busy slot keeps auto mode out of the check window,
    // but if it is somehow live (started earlier), buffering must not be turned
    // off — segmentation lives in run_buffering, and without it the
    // interviewer's feed dies.
    let buffer_enabled = current_settings(app).buffer_enabled || auto::is_active(app);
    let st = app.state::<App>();
    let mut guard = st.capture.lock().unwrap();
    let Some(capture) = guard.as_mut() else {
        return Ok(Vec::new());
    };
    let samples = capture.stop().map_err(|e| AppError::from(&e));
    capture.set_buffering(buffer_enabled);
    samples
}

async fn record_microphone(app: &AppHandle) -> Result<Vec<f32>, AppError> {
    // Проверка микрофона поднимает тот же системный запрос, что и кнопка «Выдать»,
    // поэтому и отметку о запросе ставит та же: без неё статус навсегда остался бы
    // «не спрашивали», а `permissions_status` не отличил бы отказ от тишины.
    permissions::mark_requested(app, PermissionKind::Microphone)
        .map_err(|e| AppError::new(ErrorCode::Internal, e))?;
    let settings = current_settings(app);
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut mic = build_mic_capture(&settings).map_err(|e| AppError::from(&e))?;
        mic.start(Some(level_sink(app))).map_err(|e| AppError::from(&e))?;
        std::thread::sleep(Duration::from_secs(CHECK_SECS));
        mic.stop().map_err(|e| AppError::from(&e))
    })
    .await
    .map_err(|e| AppError::new(ErrorCode::Internal, e.to_string()))?
}

async fn verdict(app: &AppHandle, samples: Vec<f32>) -> Result<AudioCheck, AppError> {
    if audio::is_silence(&samples) {
        return Ok(AudioCheck {
            heard: false,
            text: String::new(),
        });
    }
    let text = stt_engine(app)
        .transcribe(&samples)
        .await
        .map_err(|e| AppError::from(&e))?;
    Ok(AudioCheck {
        heard: true,
        text: text.trim().to_string(),
    })
}

#[tauri::command]
#[specta::specta]
pub async fn check_audio_source(app: AppHandle, source: AudioSource) -> Result<AudioCheck, AppError> {
    ensure_idle(&app)?;
    let _slot = CheckSlot::claim(&app)?;
    let samples = match source {
        AudioSource::System => {
            start_system(&app)?;
            tokio::time::sleep(Duration::from_secs(CHECK_SECS)).await;
            stop_system(&app)?
        }
        AudioSource::Microphone => record_microphone(&app).await?,
    };
    verdict(&app, samples).await
}

#[cfg(test)]
mod tests;
