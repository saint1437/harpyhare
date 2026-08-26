use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager};

use crate::app_state::{build_mic_capture, current_settings, stt_engine, App};
use crate::capture_service::CaptureMode;
use crate::error::{AppError, ErrorCode};
use crate::permissions::{self, PermissionKind};
use crate::{audio, auto, capture, events, recording};

/// Проверка слушает фиксированное окно: за пять секунд человек успевает сказать
/// фразу, а собеседник в звонке — договорить предложение.
const CHECK_SECS: u64 = 5;
const LEVEL_INTERVAL: Duration = Duration::from_millis(100);


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

/// The five-second check window is a busy state even though the recorder is
/// Idle: starting auto mode or PTT inside it armed a segmenter in the middle of
/// a foreign session, and stop_system then tore that session down. The slot is
/// RAII so a panic inside the command cannot leave the mode claimed forever
/// (the same device as the screenshot's CaptureSlot).
struct CheckSlot(AppHandle);

impl CheckSlot {
    fn claim(app: &AppHandle) -> Result<Self, AppError> {
        app.state::<App>().capture.claim(CaptureMode::AudioCheck)?;
        Ok(Self(app.clone()))
    }
}

impl Drop for CheckSlot {
    fn drop(&mut self) {
        self.0.state::<App>().capture.release(CaptureMode::AudioCheck);
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

fn start_system(app: &AppHandle) -> Result<(), AppError> {
    // Проверка поднимает захват, а на macOS это и есть системный запрос доступа.
    // Он законен — его вызвало нажатие, — но отметку обязан оставить такую же,
    // как кнопка «Выдать»: иначе статус навсегда остался бы «не спрашивали».
    permissions::mark_requested(app, PermissionKind::Audio)?;
    recording::ensure_capture_or_err(app)?;
    let buffer_enabled = current_settings(app).buffer_enabled;
    let started = app.state::<App>().capture.with_mut(|capture| {
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
    });
    started.unwrap_or_else(|| {
        Err(AppError::with_subject(
            ErrorCode::Permission,
            recording::ERR_NO_SYSTEM_CAPTURE,
            crate::error::subject::SYSTEM_AUDIO_DEVICE,
        ))
    })
}

fn stop_system(app: &AppHandle) -> Result<Vec<f32>, AppError> {
    // Belt and braces: the busy mode keeps auto mode out of the check window,
    // but if it is somehow live (started earlier), buffering must not be turned
    // off — segmentation lives in run_buffering, and without it the
    // interviewer's feed dies.
    let buffer_enabled = current_settings(app).buffer_enabled || auto::is_active(app);
    let st = app.state::<App>();
    // `stop_taken` waits for the consumer thread OUTSIDE the capture lock: the
    // wait is up to five seconds and used to freeze everyone else meanwhile.
    let Some(stopped) = st.capture.stop_taken() else {
        return Ok(Vec::new());
    };
    st.capture.with(|c| c.set_buffering(buffer_enabled));
    stopped.map_err(|e| AppError::from(&e))
}

async fn record_microphone(app: &AppHandle) -> Result<Vec<f32>, AppError> {
    // Проверка микрофона поднимает тот же системный запрос, что и кнопка «Выдать»,
    // поэтому и отметку о запросе ставит та же: без неё статус навсегда остался бы
    // «не спрашивали», а `permissions_status` не отличил бы отказ от тишины.
    permissions::mark_requested(app, PermissionKind::Microphone)?;
    let settings = current_settings(app);
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut mic = build_mic_capture(&settings).map_err(|e| AppError::from(&e))?;
        mic.start(Some(level_sink(app))).map_err(|e| AppError::from(&e))?;
        std::thread::sleep(Duration::from_secs(CHECK_SECS));
        mic.stop().map_err(|e| AppError::from(&e))
    })
    .await
    .map_err(|e| crate::error::internal(e.to_string()))?
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
    // One claim, one answer: the mode table already knows whether push-to-talk
    // or auto listening is holding the capture, so there is no second
    // `ensure_idle` with its own copy of the policy.
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
