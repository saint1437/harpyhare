use std::sync::Arc;

use tauri::{AppHandle, Manager};

use crate::error::AppError;
use crate::llm_service::LlmService;
use crate::recording_service::RecordingService;
use crate::secrets::{Secrets, SecretsStore};
use crate::settings::SettingsService;
use crate::window_service::WindowService;
use crate::{
    access, auto, capture, llm, permissions, remote_presets, screenshot, secrets, settings, stt,
    update,
};

pub const SETTINGS_FILE_NAME: &str = "settings.json";
const CHATS_FILE_NAME: &str = "chats.json";
const CONTEXT_LIBRARY_FILE_NAME: &str = "context-library.json";

const ERR_NO_APP_DATA_DIR: &str =
    "Не удалось определить папку данных приложения — настройки и чаты негде хранить";

/// The application's state: a composition of services, not a bag of mutexes.
///
/// **Lock acquisition order**, top to bottom — take them in this order and
/// nothing here can deadlock. It was never written down before, and the audit
/// named that the source of the next deadlock:
///
/// 1. `auto.transition` — held for the whole body of `auto::start`/`stop`,
///    which takes settings, the capture and the microphone underneath it.
/// 2. `settings` — read (`current_settings`) or updated; `SettingsService::update`
///    holds it across the disk write, so nothing slower may be taken under it.
///    `secrets` is its twin over `secrets.json` and is a LEAF: nothing is ever
///    taken under it, and it is never taken under `settings` either — the two
///    files are independent, and keeping it that way is what makes the pair
///    deadlock-free without a rule to remember.
/// 3. `recording` (recorder → stt_stream → last_recording, in that order).
/// 4. `capture` (mode before device) and `auto.mic`.
/// 5. `llm` (provider, catalogue, stream slots) / `stt` / `window` / `update` —
///    leaves: none of them takes another lock while held.
///
/// Two rules ride on top of the order. `CaptureService::stop_taken` waits on a
/// condvar for up to five seconds and therefore takes the device OUT of the
/// lock before stopping it, so no one holds the capture lock across that wait.
/// And a `MutexGuard` is never held across an `.await`: every client is cloned
/// out of its service first (`llm.provider()`, `stt.engine()`).
pub struct App {
    /// The single mutation point for `Settings`, and the one-shot record of a
    /// settings file that had to be renamed aside at startup.
    pub settings: SettingsService,
    /// The two API keys and the access token — everything `Settings` may not
    /// carry, because `Settings` is what `get_settings` sends to the webview.
    pub secrets: SecretsStore,
    /// What `permissions_status` answers with. Filled by explicit probes and by
    /// the background refresh the command kicks off — the command itself never
    /// opens a device (see permissions.rs).
    pub permissions: permissions::PermissionCache,
    /// The official prompt presets, refreshed from the blob every 30 minutes.
    pub presets: remote_presets::PresetCache,
    /// The push-to-talk pipeline: the recorder FSM, the last recording, the
    /// streaming transcription slot and the recording generation.
    pub recording: RecordingService,
    /// The system-audio capture and the mode saying who holds it.
    pub capture: crate::capture_service::CaptureService,
    /// Auto listening: the microphone, the generation and the in-flight counters.
    pub auto: auto::AutoService,
    /// The speech-to-text engine behind its port.
    pub stt: stt::SttService,
    /// The provider, the model catalogue and the per-chat cancellation registry.
    pub llm: LlmService,
    /// The HUD's geometry, its folded state and the preview HTML.
    pub window: WindowService,
    /// The update found by a check, and the install lock.
    pub update: update::UpdateState,
    /// The region screenshot's re-entry guard.
    pub screenshot: screenshot::ScreenshotState,
}

/// Fallible on purpose: `expect("app_data_dir")` inside a command killed the
/// command's thread and left the window alive and dead. There is no sane
/// fallback for a machine with no resolvable home directory, but there is a
/// difference between telling the user and vanishing.
pub fn app_data_file(app: &AppHandle, file_name: &str) -> Result<std::path::PathBuf, AppError> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join(file_name))
        .map_err(|e| AppError::new(crate::error::ErrorCode::Internal, format!("{ERR_NO_APP_DATA_DIR}: {e}")))
}

pub fn settings_path(app: &AppHandle) -> Result<std::path::PathBuf, AppError> {
    app_data_file(app, SETTINGS_FILE_NAME)
}

pub fn secrets_path(app: &AppHandle) -> Result<std::path::PathBuf, AppError> {
    app_data_file(app, secrets::SECRETS_FILE_NAME)
}

pub fn chats_path(app: &AppHandle) -> Result<std::path::PathBuf, AppError> {
    app_data_file(app, CHATS_FILE_NAME)
}

pub fn context_library_path(app: &AppHandle) -> Result<std::path::PathBuf, AppError> {
    app_data_file(app, CONTEXT_LIBRARY_FILE_NAME)
}

pub fn chat_images_dir(app: &AppHandle) -> Result<std::path::PathBuf, AppError> {
    app_data_file(app, crate::chat_images::IMAGES_DIR_NAME)
}

pub fn current_settings(app: &AppHandle) -> settings::Settings {
    app.state::<App>().settings.get()
}

pub fn llm_provider(app: &AppHandle) -> Arc<dyn llm::LlmProvider> {
    app.state::<App>().llm.provider()
}

pub fn stt_engine(app: &AppHandle) -> Arc<dyn stt::SttEngine> {
    app.state::<App>().stt.engine()
}

fn optional_uid(uid: &str) -> Option<&str> {
    (!uid.is_empty()).then_some(uid)
}

pub fn build_mic_capture(
    settings: &settings::Settings,
) -> Result<capture::AudioCapture, capture::CaptureError> {
    capture::AudioCapture::new(
        capture::SourceKind::Input,
        optional_uid(&settings.auto_mic_device_uid),
        settings.buffer_seconds.into(),
    )
}

pub fn build_capture(settings: &settings::Settings) -> Option<Box<dyn capture::CaptureDevice>> {
    let uid = optional_uid(&settings.capture_device_uid);
    match capture::AudioCapture::new(
        capture::SourceKind::Output,
        uid,
        settings.buffer_seconds.into(),
    ) {
        Ok(c) => {
            c.set_buffering(settings.buffer_enabled);
            Some(Box::new(c))
        }
        Err(e) => {
            eprintln!("захват системного звука недоступен: {e}");
            None
        }
    }
}

pub fn build_stt_client(s: &settings::Settings, secrets: &Secrets) -> Arc<dyn stt::SttEngine> {
    let base = if secrets.has_access_token() {
        stt::GroqStt::new(secrets.access_token.clone())
            .with_base_url(access::proxy_base_url())
            .with_proxy(true)
    } else {
        stt::GroqStt::new(secrets.groq_api_key.clone())
    };
    Arc::new(
        base.with_language(s.stt_language.clone())
            .with_translate(s.stt_translate),
    )
}

/// Takes no `Settings` at all any more: nothing about the LLM client depends on
/// them once the credentials moved out. Kept as a free function beside its STT
/// twin so the pair stays visibly one decision.
pub fn build_llm_client(
    secrets: &Secrets,
    catalog: llm::ModelCatalog,
) -> Arc<dyn llm::LlmProvider> {
    let client = if secrets.has_access_token() {
        llm::AnthropicClient::for_proxy(secrets.access_token.clone(), access::proxy_base_url())
    } else {
        llm::AnthropicClient::new(secrets.anthropic_api_key.clone())
    };
    Arc::new(client.with_catalog(catalog))
}

pub fn build_app_state(
    settings: SettingsService,
    secrets: SecretsStore,
    official_presets: Vec<settings::PromptPreset>,
    stt: Arc<dyn stt::SttEngine>,
    llm: Arc<dyn llm::LlmProvider>,
    models: llm::ModelCatalog,
) -> App {
    App {
        settings,
        secrets,
        permissions: permissions::PermissionCache::default(),
        presets: remote_presets::PresetCache::new(official_presets),
        recording: RecordingService::default(),
        capture: crate::capture_service::CaptureService::default(),
        auto: auto::AutoService::default(),
        stt: stt::SttService::new(stt),
        llm: LlmService::new(llm, models),
        window: WindowService::default(),
        update: update::UpdateState::default(),
        screenshot: screenshot::ScreenshotState::default(),
    }
}
