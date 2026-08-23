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
const ERR_NO_SYSTEM_CAPTURE: &str = "Захват системного звука недоступен";

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
    pub peak: f32,
    pub text: String,
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
    if !recording::ensure_capture(app) {
        return Err(AppError::new(ErrorCode::Permission, ERR_NO_SYSTEM_CAPTURE));
    }
    let st = app.state::<App>();
    let mut guard = st.capture.lock().unwrap();
    let Some(capture) = guard.as_mut() else {
        return Err(AppError::new(ErrorCode::Permission, ERR_NO_SYSTEM_CAPTURE));
    };
    // Фоновый буфер выключается на время проверки: иначе в неё попал бы хвост,
    // записанный ДО нажатия, и «слышно» значило бы «было слышно когда-то».
    capture.set_buffering(false);
    capture.start(Some(level_sink(app.clone()))).map_err(|e| AppError::from(&e))
}

fn stop_system(app: &AppHandle) -> Result<Vec<f32>, AppError> {
    let buffer_enabled = current_settings(app).buffer_enabled;
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
    let peak = peak_level(&samples);
    if audio::is_silence(&samples) {
        return Ok(AudioCheck {
            heard: false,
            peak,
            text: String::new(),
        });
    }
    let text = stt_engine(app)
        .transcribe(&samples)
        .await
        .map_err(|e| AppError::from(&e))?;
    Ok(AudioCheck {
        heard: true,
        peak,
        text: text.trim().to_string(),
    })
}

#[tauri::command]
#[specta::specta]
pub async fn check_audio_source(app: AppHandle, source: AudioSource) -> Result<AudioCheck, AppError> {
    ensure_idle(&app)?;
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
