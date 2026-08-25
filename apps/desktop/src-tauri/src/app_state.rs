use std::collections::HashMap;
use std::sync::{
    atomic::{AtomicBool, AtomicU64},
    Arc, Mutex,
};

use tauri::{AppHandle, Manager};
use tokio_util::sync::CancellationToken;

use crate::{access, auto, capture, chat, llm, settings, state, stt};

const SETTINGS_FILE_NAME: &str = "settings.json";
const CHATS_FILE_NAME: &str = "chats.json";
const CONTEXT_LIBRARY_FILE_NAME: &str = "context-library.json";

pub struct App {
    pub settings: Mutex<settings::Settings>,
    pub official_presets: Mutex<Vec<settings::PromptPreset>>,
    pub recorder: Mutex<state::RecorderState>,
    pub capture: Mutex<Option<capture::AudioCapture>>,
    pub mic_capture: Mutex<Option<capture::AudioCapture>>,
    pub auto: auto::AutoState,
    pub last_recording: Mutex<Option<Vec<f32>>>,
    pub llm_cancel: Mutex<HashMap<String, chat::LlmStreamSlot>>,
    pub stt: Mutex<Arc<dyn stt::SttEngine>>,
    pub llm: Mutex<Arc<dyn llm::LlmProvider>>,
    pub stt_stream: Mutex<Option<SttStream>>,
    pub models: llm::ModelCatalog,
    pub recording_gen: AtomicU64,
    pub resize_gen: AtomicU64,
    pub capture_rebuild_pending: AtomicBool,
    pub preview_html: Mutex<String>,
    pub pending_update: Mutex<Option<tauri_plugin_updater::Update>>,
    pub update_installing: AtomicBool,
    pub screenshot_capturing: AtomicBool,
    /// Свёрнут ли HUD в клубок. Живёт в Rust, потому что глобальный хоткей
    /// сворачивания обрабатывается здесь же, а окно меняет только Rust.
    pub window_collapsed: AtomicBool,
}

pub struct SttStream {
    pub(crate) handle: tauri::async_runtime::JoinHandle<Result<String, stt::SttError>>,
    pub(crate) cancel: CancellationToken,
    pub(crate) broken: Arc<AtomicBool>,
}

pub fn app_data_file(app: &AppHandle, file_name: &str) -> std::path::PathBuf {
    app.path().app_data_dir().expect("app_data_dir").join(file_name)
}

pub fn settings_path(app: &AppHandle) -> std::path::PathBuf {
    app_data_file(app, SETTINGS_FILE_NAME)
}

pub fn chats_path(app: &AppHandle) -> std::path::PathBuf {
    app_data_file(app, CHATS_FILE_NAME)
}

pub fn context_library_path(app: &AppHandle) -> std::path::PathBuf {
    app_data_file(app, CONTEXT_LIBRARY_FILE_NAME)
}

pub fn chat_images_dir(app: &AppHandle) -> std::path::PathBuf {
    app_data_file(app, crate::chat_images::IMAGES_DIR_NAME)
}

pub fn current_settings(app: &AppHandle) -> settings::Settings {
    app.state::<App>().settings.lock().unwrap().clone()
}

pub fn llm_provider(app: &AppHandle) -> Arc<dyn llm::LlmProvider> {
    Arc::clone(&*app.state::<App>().llm.lock().unwrap())
}

pub fn stt_engine(app: &AppHandle) -> Arc<dyn stt::SttEngine> {
    Arc::clone(&*app.state::<App>().stt.lock().unwrap())
}

pub fn cancel_stt_stream(app: &AppHandle) {
    if let Some(s) = app.state::<App>().stt_stream.lock().unwrap().take() {
        s.cancel.cancel();
    }
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

pub fn build_capture(settings: &settings::Settings) -> Option<capture::AudioCapture> {
    let uid = optional_uid(&settings.capture_device_uid);
    match capture::AudioCapture::new(
        capture::SourceKind::Output,
        uid,
        settings.buffer_seconds.into(),
    ) {
        Ok(c) => {
            c.set_buffering(settings.buffer_enabled);
            Some(c)
        }
        Err(e) => {
            eprintln!("захват системного звука недоступен: {e}");
            None
        }
    }
}

pub fn build_stt_client(s: &settings::Settings) -> Arc<dyn stt::SttEngine> {
    let base = if s.access_token.is_empty() {
        stt::GroqStt::new(s.groq_api_key.clone())
    } else {
        stt::GroqStt::new(s.access_token.clone())
            .with_base_url(access::proxy_base_url())
            .with_proxy(true)
    };
    Arc::new(
        base.with_language(s.stt_language.clone())
            .with_translate(s.stt_translate),
    )
}

pub fn build_llm_client(
    s: &settings::Settings,
    catalog: llm::ModelCatalog,
) -> Arc<dyn llm::LlmProvider> {
    let client = if s.access_token.is_empty() {
        llm::AnthropicClient::new(s.anthropic_api_key.clone())
    } else {
        llm::AnthropicClient::for_proxy(s.access_token.clone(), access::proxy_base_url())
    };
    Arc::new(client.with_catalog(catalog))
}

pub fn build_app_state(
    settings: settings::Settings,
    official_presets: Vec<settings::PromptPreset>,
    capture: Option<capture::AudioCapture>,
    stt: Arc<dyn stt::SttEngine>,
    llm: Arc<dyn llm::LlmProvider>,
    models: llm::ModelCatalog,
) -> App {
    App {
        settings: Mutex::new(settings),
        official_presets: Mutex::new(official_presets),
        recorder: Mutex::new(state::RecorderState::Idle),
        capture: Mutex::new(capture),
        last_recording: Mutex::new(None),
        llm_cancel: Mutex::new(HashMap::new()),
        stt: Mutex::new(stt),
        llm: Mutex::new(llm),
        stt_stream: Mutex::new(None),
        models,
        recording_gen: AtomicU64::new(0),
        resize_gen: AtomicU64::new(0),
        capture_rebuild_pending: AtomicBool::new(false),
        preview_html: Mutex::new(String::new()),
        pending_update: Mutex::new(None),
        update_installing: AtomicBool::new(false),
        screenshot_capturing: AtomicBool::new(false),
        window_collapsed: AtomicBool::new(false),
        mic_capture: Mutex::new(None),
        auto: auto::AutoState::default(),
    }
}
