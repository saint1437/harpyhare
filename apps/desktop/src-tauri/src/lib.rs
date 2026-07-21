pub mod access;
pub mod audio;
pub mod capture;
pub mod chats;
pub mod context_import;
pub mod hotkey;
pub mod llm;
pub mod preview_protocol;
pub mod remote_presets;
pub mod settings;
pub mod state;
pub mod stt;
pub mod update;
pub mod window_geom;

use std::collections::HashMap;
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Arc, Mutex,
};
use std::time::Duration;
use cidre::core_audio;
use futures_util::StreamExt;
use tauri::{AppHandle, Emitter, Manager};
use tokio_util::sync::CancellationToken;

const SETTINGS_FILE_NAME: &str = "settings.json";
const CHATS_FILE_NAME: &str = "chats.json";
const CONTEXT_LIBRARY_FILE_NAME: &str = "context-library.json";
const ENV_FILE_NAME: &str = ".env";
const ANTHROPIC_API_KEY_ENV: &str = "ANTHROPIC_API_KEY";
const GROQ_API_KEY_ENV: &str = "GROQ_API_KEY";

const MAIN_WINDOW_LABEL: &str = "main";
const PREVIEW_URI_SCHEME: &str = "preview";

const EVENT_STATE_CHANGED: &str = "state-changed";
const EVENT_TRANSCRIPT_READY: &str = "transcript-ready";
const EVENT_STT_ERROR: &str = "stt-error";
const EVENT_LLM_DELTA: &str = "llm-delta";
const EVENT_LLM_DONE: &str = "llm-done";
const EVENT_LLM_ERROR: &str = "llm-error";
const EVENT_LLM_USAGE: &str = "llm-usage";
const EVENT_TOGGLE_TELEPROMPTER: &str = "toggle-teleprompter";
const EVENT_RESIZE_KEY: &str = "resize-key";
const RESIZE_DIM_WIDTH: &str = "width";
const RESIZE_DIM_HEIGHT: &str = "height";

const ERR_NO_CAPTURE_PERMISSION: &str = "Нет разрешения на запись системного звука";
const ERR_NO_AUDIO_BUFFER: &str = "нет аудио-буфера";
const ERR_SILENCE: &str = "Тишина — нечего распознавать (если звук играл: проверь право «Запись системного звука» у macOS и устройство захвата в настройках)";

const STT_STREAM_CHANNEL_CAPACITY: usize = 256;
const LLM_DELTA_FLUSH_INTERVAL: Duration = Duration::from_millis(25);
const MAX_DURATION_WATCHDOG_INTERVAL: Duration = Duration::from_secs(1);

const WINDOW_CORNER_RADIUS_LOGICAL_PX: f64 = 22.0;
const RESIZE_TWEEN_STEPS: u32 = 14;
const RESIZE_TWEEN_FRAME_INTERVAL: Duration = Duration::from_millis(13);
const RESIZE_EPSILON_LOGICAL_PX: f64 = 1.0;

const KEY_CODE_ARROW_LEFT: u16 = 123;
const KEY_CODE_ARROW_RIGHT: u16 = 124;
const KEY_CODE_ARROW_DOWN: u16 = 125;
const KEY_CODE_ARROW_UP: u16 = 126;

const OPEN_COMMAND: &str = "open";
const AUDIO_CAPTURE_PRIVACY_PANE_URL: &str =
    "x-apple.systempreferences:com.apple.preference.security?Privacy_AudioCapture";
const HTTPS_URL_PREFIX: &str = "https://";
const HTTP_URL_PREFIX: &str = "http://";

pub struct App {
    pub settings: Mutex<settings::Settings>,
    pub official_presets: Mutex<Vec<settings::PromptPreset>>,
    pub recorder: Mutex<state::RecorderState>,
    pub capture: Mutex<Option<capture::SystemAudioCapture>>,
    pub last_recording: Mutex<Option<Vec<f32>>>,
    pub llm_cancel: Mutex<HashMap<String, CancellationToken>>,
    pub stt: Mutex<stt::GroqStt>,
    pub llm: Mutex<llm::AnthropicClient>,
    pub stt_stream: Mutex<Option<SttStream>>,
    pub models: Mutex<Vec<llm::ModelInfo>>,
    pub recording_gen: AtomicU64,
    pub resize_gen: AtomicU64,
    pub capture_rebuild_pending: AtomicBool,
    pub preview_html: Mutex<String>,
    pub pending_update: Mutex<Option<tauri_plugin_updater::Update>>,
    pub update_installing: AtomicBool,
}

pub struct SttStream {
    handle: tauri::async_runtime::JoinHandle<Result<String, stt::SttError>>,
    cancel: CancellationToken,
    broken: Arc<AtomicBool>,
}

fn cancel_stt_stream(app: &AppHandle) {
    if let Some(s) = app.state::<App>().stt_stream.lock().unwrap().take() {
        s.cancel.cancel();
    }
}

pub(crate) fn app_data_file(app: &AppHandle, file_name: &str) -> std::path::PathBuf {
    app.path().app_data_dir().expect("app_data_dir").join(file_name)
}

fn settings_path(app: &AppHandle) -> std::path::PathBuf {
    app_data_file(app, SETTINGS_FILE_NAME)
}

fn chats_path(app: &AppHandle) -> std::path::PathBuf {
    app_data_file(app, CHATS_FILE_NAME)
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct LlmDelta {
    chat_id: String,
    delta: String,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct LlmDone {
    chat_id: String,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct LlmUsage {
    chat_id: String,
    input_tokens: u64,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct LlmError {
    chat_id: String,
    message: String,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .register_uri_scheme_protocol(PREVIEW_URI_SCHEME, |ctx, _request| {
            let html = ctx
                .app_handle()
                .state::<App>()
                .preview_html
                .lock()
                .unwrap()
                .clone();
            preview_protocol::preview_response(&html)
        })
        .setup(|app| {
            setup_app(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            send_to_claude,
            cancel_stream,
            list_models,
            load_chats,
            save_chats,
            load_context_library,
            save_context_library,
            read_context_import_file,
            retry_transcription,
            get_settings,
            set_settings,
            list_audio_output_devices,
            redeem_access_code,
            get_official_presets,
            move_window_by,
            set_window_size,
            set_ptt_suspended,
            close_app,
            hide_main_window,
            open_audio_permission_settings,
            open_external,
            capture_available,
            request_audio_capture_permission,
            set_preview_html,
            check_for_update,
            install_update,
            get_app_version,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn setup_app(handle: &AppHandle) {
    load_dotenv_files();
    let settings = load_settings_with_env_key_fallback(handle);
    let official_presets = remote_presets::load_initial(handle);
    let capture = build_capture(&settings.capture_device_uid);
    let stt = build_stt_client(&settings);
    let llm = build_llm_client(&settings);
    apply_screen_share_visibility_at_startup(handle, &settings);
    apply_window_size_at_startup(handle, &settings);
    clip_native_window_corners(handle);
    let ptt_hotkey = settings.hotkey.clone();
    let toggle_hotkey = settings.toggle_hotkey.clone();
    let teleprompter_hotkey = settings.teleprompter_hotkey.clone();
    spawn_startup_warm_up_and_model_fetch(handle.clone(), stt.clone(), llm.clone());
    handle.manage(build_app_state(settings, official_presets, capture, stt, llm));
    register_startup_hotkeys(handle, &ptt_hotkey, &toggle_hotkey, &teleprompter_hotkey);
    install_default_output_device_listener(handle);
    install_move_keys_monitor(handle.clone());
    disable_cursor_autohide_on_typing();
    update::spawn_auto_check(handle.clone());
    remote_presets::spawn_refresh(handle.clone());
}

fn disable_cursor_autohide_on_typing() {
    unsafe extern "C-unwind" fn keep_cursor_visible() {}

    let Some(cursor_class) = objc2::runtime::AnyClass::get(c"NSCursor") else {
        return;
    };
    let Some(method) = cursor_class
        .metaclass()
        .instance_method(objc2::sel!(setHiddenUntilMouseMoves:))
    else {
        return;
    };
    unsafe {
        let _ = objc2::ffi::method_setImplementation(
            std::ptr::from_ref(method).cast(),
            keep_cursor_visible,
        );
    }
}

fn load_dotenv_files() {
    let _ = dotenvy::dotenv();
    if let Some(project_env) = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(|root| root.join(ENV_FILE_NAME))
    {
        let _ = dotenvy::from_path(project_env);
    }
}

fn load_settings_with_env_key_fallback(app: &AppHandle) -> settings::Settings {
    let mut settings = settings::Settings::load(&settings_path(app))
        .unwrap_or_else(|_| settings::Settings::default());
    settings.apply_key_fallback(
        std::env::var(ANTHROPIC_API_KEY_ENV).ok(),
        std::env::var(GROQ_API_KEY_ENV).ok(),
    );
    settings
}

fn build_capture(device_uid: &str) -> Option<capture::SystemAudioCapture> {
    let uid = if device_uid.is_empty() { None } else { Some(device_uid) };
    match capture::SystemAudioCapture::new(uid) {
        Ok(c) => Some(c),
        Err(e) => {
            eprintln!("захват системного звука недоступен: {e}");
            None
        }
    }
}

extern "C-unwind" fn on_default_output_device_changed(
    _obj: core_audio::Obj,
    _number_addresses: u32,
    _addresses: *const core_audio::PropAddr,
    client_data: *mut AppHandle,
) -> cidre::os::Status {
    let app = unsafe { &*client_data }.clone();
    tauri::async_runtime::spawn(async move {
        handle_default_output_device_changed(&app);
    });
    cidre::os::Status::NO_ERR
}

fn install_default_output_device_listener(app: &AppHandle) {
    let client_data = Box::leak(Box::new(app.clone()));
    let addr = core_audio::PropSelector::HW_DEFAULT_OUTPUT_DEVICE.global_addr();
    if let Err(e) =
        core_audio::System::OBJ.add_prop_listener(&addr, on_default_output_device_changed, client_data)
    {
        eprintln!("не удалось подписаться на смену аудио-вывода: {e:?}");
    }
}

fn handle_default_output_device_changed(app: &AppHandle) {
    let follows_system_default = app
        .state::<App>()
        .settings
        .lock()
        .unwrap()
        .capture_device_uid
        .is_empty();
    if follows_system_default {
        request_capture_rebuild(app);
    }
}

fn request_capture_rebuild(app: &AppHandle) {
    let st = app.state::<App>();
    let idle = *st.recorder.lock().unwrap() == state::RecorderState::Idle;
    if idle {
        rebuild_capture_now(app);
    } else {
        st.capture_rebuild_pending.store(true, Ordering::SeqCst);
    }
}

fn rebuild_capture_now(app: &AppHandle) {
    let st = app.state::<App>();
    let device_uid = st.settings.lock().unwrap().capture_device_uid.clone();
    let new_capture = build_capture(&device_uid);
    *st.capture.lock().unwrap() = new_capture;
}

fn build_stt_client(s: &settings::Settings) -> stt::GroqStt {
    let base = if s.access_token.is_empty() {
        stt::GroqStt::new(s.groq_api_key.clone())
    } else {
        stt::GroqStt::new(s.access_token.clone())
            .with_base_url(access::proxy_base_url())
            .with_proxy(true)
    };
    base.with_language(s.stt_language.clone())
        .with_translate(s.stt_translate)
}

fn build_llm_client(s: &settings::Settings) -> llm::AnthropicClient {
    if s.access_token.is_empty() {
        llm::AnthropicClient::new(s.anthropic_api_key.clone())
    } else {
        llm::AnthropicClient::for_proxy(s.access_token.clone(), access::proxy_base_url())
    }
}

fn apply_screen_share_visibility_at_startup(app: &AppHandle, settings: &settings::Settings) {
    if settings.screen_share_visible {
        if let Some(w) = app.get_webview_window(MAIN_WINDOW_LABEL) {
            let _ = w.set_content_protected(false);
        }
    }
}

fn apply_window_size_at_startup(app: &AppHandle, settings: &settings::Settings) {
    if let Some(w) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = w.set_size(tauri::LogicalSize::new(
            settings.window_width,
            settings.window_height,
        ));
    }
}

fn clip_native_window_corners(app: &AppHandle) {
    use objc2::{msg_send, runtime::AnyObject};
    let Some(w) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return;
    };
    let Ok(ns_window) = w.ns_window() else {
        return;
    };
    let ns_window = ns_window.cast::<AnyObject>();
    unsafe {
        let content_view: *mut AnyObject = msg_send![ns_window, contentView];
        if content_view.is_null() {
            return;
        }
        let _: () = msg_send![content_view, setWantsLayer: true];
        let layer: *mut AnyObject = msg_send![content_view, layer];
        if layer.is_null() {
            return;
        }
        let _: () = msg_send![layer, setCornerRadius: WINDOW_CORNER_RADIUS_LOGICAL_PX];
        let _: () = msg_send![layer, setMasksToBounds: true];
    }
}

fn spawn_startup_warm_up_and_model_fetch(
    handle: AppHandle,
    stt: stt::GroqStt,
    llm: llm::AnthropicClient,
) {
    tauri::async_runtime::spawn(async move {
        let (_, models) = tokio::join!(stt.warm_up(), llm.list_models());
        if let Ok(models) = models {
            if !models.is_empty() {
                *handle.state::<App>().models.lock().unwrap() = models;
            }
        }
    });
}

fn build_app_state(
    settings: settings::Settings,
    official_presets: Vec<settings::PromptPreset>,
    capture: Option<capture::SystemAudioCapture>,
    stt: stt::GroqStt,
    llm: llm::AnthropicClient,
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
        models: Mutex::new(llm::fallback_models()),
        recording_gen: AtomicU64::new(0),
        resize_gen: AtomicU64::new(0),
        capture_rebuild_pending: AtomicBool::new(false),
        preview_html: Mutex::new(String::new()),
        pending_update: Mutex::new(None),
        update_installing: AtomicBool::new(false),
    }
}

fn register_startup_hotkeys(
    app: &AppHandle,
    ptt_hotkey: &str,
    toggle_hotkey: &str,
    teleprompter_hotkey: &str,
) {
    if let Err(e) = hotkey::register_ptt(app, ptt_hotkey) {
        eprintln!("не удалось зарегистрировать PTT-хоткей {ptt_hotkey:?}: {e}");
    }
    if let Err(e) = hotkey::register_toggle(app, toggle_hotkey) {
        eprintln!("не удалось зарегистрировать toggle-хоткей {toggle_hotkey:?}: {e}");
    }
    if let Err(e) = hotkey::register_teleprompter(app, teleprompter_hotkey) {
        eprintln!("не удалось зарегистрировать суфлёр-хоткей {teleprompter_hotkey:?}: {e}");
    }
}

#[derive(Clone, serde::Serialize)]
struct ResizeKeyPayload {
    dim: &'static str,
    dir: i32,
}

fn emit_resize_key(app: &AppHandle, dx: i32, dy: i32) {
    let (dim, dir) = if dx != 0 {
        (RESIZE_DIM_WIDTH, dx)
    } else {
        (RESIZE_DIM_HEIGHT, dy)
    };
    let _ = app.emit(EVENT_RESIZE_KEY, ResizeKeyPayload { dim, dir });
}

fn install_move_keys_monitor(app: AppHandle) {
    use objc2_app_kit::{NSEvent, NSEventMask, NSEventModifierFlags};

    let block = block2::RcBlock::new(
        move |ev: std::ptr::NonNull<NSEvent>| -> *mut NSEvent {
            let pass = ev.as_ptr();
            let event = unsafe { ev.as_ref() };
            let flags = event.modifierFlags();
            if !flags.contains(NSEventModifierFlags::Command)
                && !flags.contains(NSEventModifierFlags::Control)
            {
                return pass;
            }
            let (dx, dy) = match event.keyCode() {
                KEY_CODE_ARROW_LEFT => (-1i32, 0i32),
                KEY_CODE_ARROW_RIGHT => (1, 0),
                KEY_CODE_ARROW_DOWN => (0, 1),
                KEY_CODE_ARROW_UP => (0, -1),
                _ => return pass,
            };
            if flags.contains(NSEventModifierFlags::Shift) {
                emit_resize_key(&app, dx, dy);
                return std::ptr::null_mut();
            }
            let step = app.state::<App>().settings.lock().unwrap().move_step as i32;
            if let Some(w) = app.get_webview_window(MAIN_WINDOW_LABEL) {
                if let Ok(pos) = w.outer_position() {
                    let _ = w.set_position(tauri::PhysicalPosition::new(
                        pos.x + dx * step,
                        pos.y + dy * step,
                    ));
                }
            }
            std::ptr::null_mut()
        },
    );
    let monitor = unsafe {
        NSEvent::addLocalMonitorForEventsMatchingMask_handler(NSEventMask::KeyDown, &block)
    };
    std::mem::forget(monitor);
}

fn emit_state(app: &AppHandle, s: state::RecorderState) {
    let _ = app.emit(EVENT_STATE_CHANGED, s);
}

pub fn on_ptt_pressed(app: &AppHandle) {
    let st = app.state::<App>();
    if st.capture_rebuild_pending.swap(false, Ordering::SeqCst) {
        rebuild_capture_now(app);
    }
    if st.capture.lock().unwrap().is_none() {
        let _ = app.emit(EVENT_STT_ERROR, ERR_NO_CAPTURE_PERMISSION);
        return;
    }
    let action = st.recorder.lock().unwrap().on(state::Event::PttPressed);
    if action != state::Action::StartCapture {
        return;
    }
    let sink = start_streaming_transcription(app);
    if let Some(c) = st.capture.lock().unwrap().as_mut() {
        if let Err(e) = c.start(Some(sink)) {
            cancel_stt_stream(app);
            let _ = app.emit(EVENT_STT_ERROR, e.to_string());
            st.recorder.lock().unwrap().on(state::Event::Cancel);
            return;
        }
    }
    let gen = st.recording_gen.fetch_add(1, Ordering::SeqCst) + 1;
    hotkey::register_esc(app);
    emit_state(app, state::RecorderState::Recording);
    spawn_max_duration_watchdog(app.clone(), gen);
    warm_up_llm_for_upcoming_request(app);
}

type SttBodyChunk = Result<Vec<u8>, std::io::Error>;

fn start_streaming_transcription(app: &AppHandle) -> capture::ChunkSink {
    let st = app.state::<App>();
    let stt_client = st.stt.lock().unwrap().clone();
    let cancel = CancellationToken::new();
    let broken = Arc::new(AtomicBool::new(false));
    let (tx, rx) = tokio::sync::mpsc::channel::<SttBodyChunk>(STT_STREAM_CHANNEL_CAPACITY);
    let header: SttBodyChunk = Ok(audio::wav_header_streaming().to_vec());
    let body_stream = futures_util::stream::iter([header]).chain(
        futures_util::stream::unfold(rx, |mut rx| async move {
            rx.recv().await.map(|item| (item, rx))
        }),
    );
    let handle = {
        let cancel = cancel.clone();
        tauri::async_runtime::spawn(async move {
            stt_client
                .transcribe_stream(reqwest::Body::wrap_stream(body_stream), cancel)
                .await
        })
    };
    if let Some(old) = st.stt_stream.lock().unwrap().replace(SttStream {
        handle,
        cancel,
        broken: Arc::clone(&broken),
    }) {
        old.cancel.cancel();
    }
    Box::new(move |samples: &[f32]| {
        if broken.load(Ordering::Relaxed) {
            return;
        }
        if tx.try_send(Ok(audio::f32_to_i16le_bytes(samples))).is_err() {
            broken.store(true, Ordering::Relaxed);
        }
    })
}

fn warm_up_llm_for_upcoming_request(app: &AppHandle) {
    let llm_client = app.state::<App>().llm.lock().unwrap().clone();
    tauri::async_runtime::spawn(async move { llm_client.warm_up().await });
}

fn current_recording_secs(st: &App) -> f32 {
    st.capture
        .lock()
        .unwrap()
        .as_ref()
        .map(|c| c.recording_secs())
        .unwrap_or(0.0)
}

fn stop_capture_discarding(st: &App) {
    if let Some(c) = st.capture.lock().unwrap().as_mut() {
        let _ = c.stop();
    }
}

pub fn on_ptt_released(app: &AppHandle) {
    let st = app.state::<App>();
    let secs = current_recording_secs(&st);
    let action = st
        .recorder
        .lock()
        .unwrap()
        .on(state::Event::PttReleased { duration_secs: secs });
    hotkey::unregister_esc(app);
    finish_recording(app, action);
}

pub fn on_cancel(app: &AppHandle) {
    let st = app.state::<App>();
    let action = st.recorder.lock().unwrap().on(state::Event::Cancel);
    if action == state::Action::Discard {
        cancel_stt_stream(app);
        stop_capture_discarding(&st);
        hotkey::unregister_esc(app);
        emit_state(app, state::RecorderState::Idle);
    }
}

pub fn on_toggle_visibility(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        if w.is_visible().unwrap_or(true) {
            let _ = w.hide();
        } else {
            let _ = w.show();
            let _ = w.set_focus();
        }
    }
}

pub fn on_toggle_teleprompter(app: &AppHandle) {
    let _ = app.emit(EVENT_TOGGLE_TELEPROMPTER, ());
}

fn finish_recording(app: &AppHandle, action: state::Action) {
    match action {
        state::Action::Discard => {
            cancel_stt_stream(app);
            stop_capture_discarding(&app.state::<App>());
            emit_state(app, state::RecorderState::Idle);
        }
        state::Action::Transcribe => transcribe_recording(app),
        _ => {}
    }
}

fn transcribe_recording(app: &AppHandle) {
    emit_state(app, state::RecorderState::Transcribing);
    let s16k = match stop_capture_for_transcription(app) {
        Ok(v) => v,
        Err(msg) => {
            cancel_stt_stream(app);
            return finish_transcription(app, Err(msg));
        }
    };
    if audio::is_silence(&s16k) {
        cancel_stt_stream(app);
        return finish_transcription(app, Err(ERR_SILENCE.into()));
    }
    *app.state::<App>().last_recording.lock().unwrap() = Some(s16k.clone());
    let app2 = app.clone();
    tauri::async_runtime::spawn(async move { finish_transcribe(app2, s16k).await });
}

fn stop_capture_for_transcription(app: &AppHandle) -> Result<Vec<f32>, String> {
    let t = std::time::Instant::now();
    let stopped = app
        .state::<App>()
        .capture
        .lock()
        .unwrap()
        .as_mut()
        .map(|c| c.stop());
    let Some(stopped) = stopped else {
        return Err(ERR_NO_AUDIO_BUFFER.into());
    };
    let s16k = stopped.map_err(|e| e.to_string())?;
    eprintln!(
        "[perf] stop → 16k моно готов ({:.1}s audio) за {:?}",
        s16k.len() as f32 / audio::TARGET_SAMPLE_RATE as f32,
        t.elapsed()
    );
    Ok(s16k)
}

async fn finish_transcribe(app: AppHandle, samples: Vec<f32>) {
    let t = std::time::Instant::now();
    let stream = app.state::<App>().stt_stream.lock().unwrap().take();
    if let Some(s) = stream {
        if s.broken.load(Ordering::Relaxed) {
            eprintln!("[perf] stt stream неполон — фолбэк на классическую загрузку");
            s.cancel.cancel();
        } else {
            match s.handle.await {
                Ok(Ok(text)) => {
                    eprintln!("[perf] stop → transcript (stream) {:?}", t.elapsed());
                    return deliver_transcript(&app, text);
                }
                Ok(Err(e @ (stt::SttError::BadApiKey | stt::SttError::BadAccessCode(_)))) => {
                    return finish_transcription(&app, Err(e.to_string()));
                }
                Ok(Err(e)) => {
                    eprintln!("[perf] stt stream не удался ({e}) — фолбэк на классику");
                }
                Err(e) => {
                    eprintln!("[perf] stt stream задача упала ({e}) — фолбэк на классику");
                }
            }
        }
    }
    transcribe_and_emit(app, samples).await;
}

fn deliver_transcript(app: &AppHandle, text: String) {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    let _ = app.clipboard().write_text(text.clone());
    let _ = app.emit(EVENT_TRANSCRIPT_READY, text);
    finish_transcription(app, Ok(()));
}

async fn transcribe_and_emit(app: AppHandle, samples: Vec<f32>) {
    use stt::SttEngine;
    let stt_client = app.state::<App>().stt.lock().unwrap().clone();
    let t = std::time::Instant::now();
    let res = stt_client.transcribe(&samples).await;
    eprintln!("[perf] stt transcribe (wav+upload+inference) {:?}", t.elapsed());
    match res {
        Ok(text) => deliver_transcript(&app, text),
        Err(e) => finish_transcription(&app, Err(e.to_string())),
    }
}

fn finish_transcription(app: &AppHandle, result: Result<(), String>) {
    let st = app.state::<App>();
    st.recorder
        .lock()
        .unwrap()
        .on(state::Event::TranscriptionFinished);
    if let Err(msg) = result {
        let _ = app.emit(EVENT_STT_ERROR, msg);
    }
    emit_state(app, state::RecorderState::Idle);
}

fn spawn_max_duration_watchdog(app: AppHandle, my_gen: u64) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(MAX_DURATION_WATCHDOG_INTERVAL).await;
            let st = app.state::<App>();
            if st.recording_gen.load(Ordering::SeqCst) != my_gen {
                break;
            }
            if *st.recorder.lock().unwrap() != state::RecorderState::Recording {
                break;
            }
            if current_recording_secs(&st) >= state::MAX_RECORDING_SECS {
                let action = st
                    .recorder
                    .lock()
                    .unwrap()
                    .on(state::Event::MaxDurationReached);
                hotkey::unregister_esc(&app);
                finish_recording(&app, action);
                break;
            }
        }
    });
}

fn find_cached_model(app: &AppHandle, model_id: &str) -> Option<llm::ModelInfo> {
    let st = app.state::<App>();
    let models = st.models.lock().unwrap();
    models.iter().find(|m| m.id == model_id).cloned()
}

fn register_llm_cancel(app: &AppHandle, chat_id: &str) -> CancellationToken {
    let cancel = CancellationToken::new();
    let st = app.state::<App>();
    let mut map = st.llm_cancel.lock().unwrap();
    if let Some(old) = map.insert(chat_id.to_string(), cancel.clone()) {
        old.cancel();
    }
    cancel
}

fn unregister_llm_cancel(app: &AppHandle, chat_id: &str) {
    app.state::<App>().llm_cancel.lock().unwrap().remove(chat_id);
}

struct LlmDeltaFlusher {
    pending: Arc<Mutex<String>>,
    stop: CancellationToken,
    task: tauri::async_runtime::JoinHandle<()>,
}

impl LlmDeltaFlusher {
    async fn stop_and_await_final_drain(self) {
        self.stop.cancel();
        let _ = self.task.await;
    }
}

fn spawn_llm_delta_flusher(app: AppHandle, chat_id: String) -> LlmDeltaFlusher {
    let pending = Arc::new(Mutex::new(String::new()));
    let stop = CancellationToken::new();
    let task = {
        let pending = Arc::clone(&pending);
        let stop = stop.clone();
        tauri::async_runtime::spawn(async move {
            run_llm_delta_flusher(app, chat_id, pending, stop).await;
        })
    };
    LlmDeltaFlusher { pending, stop, task }
}

async fn run_llm_delta_flusher(
    app: AppHandle,
    chat_id: String,
    pending: Arc<Mutex<String>>,
    stop: CancellationToken,
) {
    let mut tick = tokio::time::interval(LLM_DELTA_FLUSH_INTERVAL);
    loop {
        tokio::select! {
            _ = tick.tick() => {}
            _ = stop.cancelled() => break,
        }
        flush_pending_delta(&app, &chat_id, &pending);
    }
    flush_pending_delta(&app, &chat_id, &pending);
}

fn flush_pending_delta(app: &AppHandle, chat_id: &str, pending: &Mutex<String>) {
    let delta = std::mem::take(&mut *pending.lock().unwrap());
    if !delta.is_empty() {
        let _ = app.emit(
            EVENT_LLM_DELTA,
            LlmDelta {
                chat_id: chat_id.to_string(),
                delta,
            },
        );
    }
}

fn emit_llm_result(app: &AppHandle, chat_id: String, res: Result<(), llm::LlmError>) {
    match res {
        Ok(()) | Err(llm::LlmError::Cancelled) => {
            let _ = app.emit(EVENT_LLM_DONE, LlmDone { chat_id });
        }
        Err(e) => {
            let _ = app.emit(
                EVENT_LLM_ERROR,
                LlmError {
                    chat_id,
                    message: e.to_string(),
                },
            );
        }
    }
}

#[tauri::command]
async fn send_to_claude(
    app: AppHandle,
    messages: Vec<llm::ChatMessage>,
    chat_id: String,
    system: String,
    thinking: bool,
    model: String,
    web_search: bool,
) {
    let fast = app.state::<App>().settings.lock().unwrap().fast_mode;
    let model_info = find_cached_model(&app, &model);
    let thinking_field = llm::thinking_value(model_info.as_ref(), &model, thinking);
    let web_search_field = llm::web_search_value(model_info.as_ref(), &model, web_search);
    let client = app.state::<App>().llm.lock().unwrap().clone();
    let cancel = register_llm_cancel(&app, &chat_id);
    let body =
        llm::build_request_body(&model, &system, &messages, thinking_field, fast, web_search_field);

    let flusher = spawn_llm_delta_flusher(app.clone(), chat_id.clone());
    let started = std::time::Instant::now();
    let mut got_first = false;
    let pending_in = Arc::clone(&flusher.pending);
    let res = client
        .stream_message(body, cancel, move |delta| {
            if !got_first {
                got_first = true;
                eprintln!("[perf] llm ttfb (первая текстовая дельта) {:?}", started.elapsed());
            }
            pending_in.lock().unwrap().push_str(delta);
        }, {
            let app = app.clone();
            let chat_id = chat_id.clone();
            move |input_tokens| {
                let _ = app.emit(
                    EVENT_LLM_USAGE,
                    LlmUsage {
                        chat_id: chat_id.clone(),
                        input_tokens,
                    },
                );
            }
        })
        .await;
    flusher.stop_and_await_final_drain().await;
    eprintln!("[perf] llm stream total {:?}", started.elapsed());
    unregister_llm_cancel(&app, &chat_id);
    emit_llm_result(&app, chat_id, res);
}

#[tauri::command]
fn cancel_stream(app: AppHandle, chat_id: String) {
    if let Some(c) = app.state::<App>().llm_cancel.lock().unwrap().remove(&chat_id) {
        c.cancel();
    }
}

#[tauri::command]
async fn list_models(app: AppHandle) -> Vec<llm::ModelInfo> {
    let client = app.state::<App>().llm.lock().unwrap().clone();
    match client.list_models().await {
        Ok(models) if !models.is_empty() => {
            *app.state::<App>().models.lock().unwrap() = models.clone();
            models
        }
        _ => app.state::<App>().models.lock().unwrap().clone(),
    }
}

#[tauri::command]
fn load_chats(app: AppHandle) -> String {
    chats::load(&chats_path(&app))
}

#[tauri::command]
fn save_chats(app: AppHandle, json: String) -> Result<(), String> {
    chats::save(&chats_path(&app), &json).map_err(|e| e.to_string())
}

#[tauri::command]
async fn retry_transcription(app: AppHandle) {
    let samples = app.state::<App>().last_recording.lock().unwrap().clone();
    let Some(s) = samples else { return };
    {
        let st = app.state::<App>();
        let mut rec = st.recorder.lock().unwrap();
        if *rec != state::RecorderState::Idle {
            return;
        }
        *rec = state::RecorderState::Transcribing;
    }
    emit_state(&app, state::RecorderState::Transcribing);
    transcribe_and_emit(app, s).await;
}

#[tauri::command]
fn get_settings(app: AppHandle) -> settings::Settings {
    app.state::<App>().settings.lock().unwrap().clone()
}

#[tauri::command]
fn get_official_presets(app: AppHandle) -> Vec<settings::PromptPreset> {
    app.state::<App>().official_presets.lock().unwrap().clone()
}

#[tauri::command]
fn set_settings(app: AppHandle, mut new_settings: settings::Settings) -> Result<(), String> {
    new_settings.clamp();
    let st = app.state::<App>();
    let old = st.settings.lock().unwrap().clone();
    reregister_changed_hotkeys(&app, &old, &new_settings)?;
    rebuild_changed_api_clients(&st, &old, &new_settings);
    apply_screen_share_visibility_change(&app, &old, &new_settings);
    let capture_device_changed = old.capture_device_uid != new_settings.capture_device_uid;
    new_settings
        .save(&settings_path(&app))
        .map_err(|e| e.to_string())?;
    *st.settings.lock().unwrap() = new_settings;
    if capture_device_changed {
        request_capture_rebuild(&app);
    }
    Ok(())
}

#[tauri::command]
fn list_audio_output_devices() -> Vec<capture::OutputDeviceInfo> {
    capture::list_output_devices()
}

#[tauri::command]
fn request_audio_capture_permission(app: AppHandle) -> bool {
    rebuild_capture_now(&app);
    app.state::<App>().capture.lock().unwrap().is_some()
}

fn context_library_path(app: &AppHandle) -> std::path::PathBuf {
    app_data_file(app, CONTEXT_LIBRARY_FILE_NAME)
}

#[tauri::command]
fn load_context_library(app: AppHandle) -> String {
    chats::load(&context_library_path(&app))
}

#[tauri::command]
fn save_context_library(app: AppHandle, json: String) -> Result<(), String> {
    chats::save(&context_library_path(&app), &json).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_context_import_file(path: String) -> Result<String, String> {
    context_import::read_import_file(std::path::Path::new(&path))
}

#[tauri::command]
async fn redeem_access_code(
    app: AppHandle,
    code: String,
    idempotency_key: String,
) -> Result<(), String> {
    let base_url = access::proxy_base_url();
    let token = access::redeem(&base_url, &code, &idempotency_key).await?;
    apply_access_token(&app, token)
}

fn apply_access_token(app: &AppHandle, token: String) -> Result<(), String> {
    let st = app.state::<App>();
    let old = st.settings.lock().unwrap().clone();
    let mut new_settings = old.clone();
    new_settings.access_token = token;
    new_settings.save(&settings_path(app)).map_err(|e| e.to_string())?;
    rebuild_changed_api_clients(&st, &old, &new_settings);
    *st.settings.lock().unwrap() = new_settings;
    Ok(())
}

fn reregister_changed_hotkeys(
    app: &AppHandle,
    old: &settings::Settings,
    new: &settings::Settings,
) -> Result<(), String> {
    if old.hotkey != new.hotkey {
        hotkey::register_ptt(app, &new.hotkey)?;
        hotkey::unregister_ptt(app, &old.hotkey);
    }
    if old.toggle_hotkey != new.toggle_hotkey {
        hotkey::register_toggle(app, &new.toggle_hotkey)?;
        hotkey::unregister_toggle(app, &old.toggle_hotkey);
    }
    if old.teleprompter_hotkey != new.teleprompter_hotkey {
        hotkey::register_teleprompter(app, &new.teleprompter_hotkey)?;
        hotkey::unregister_teleprompter(app, &old.teleprompter_hotkey);
    }
    Ok(())
}

fn rebuild_changed_api_clients(st: &App, old: &settings::Settings, new: &settings::Settings) {
    let access_token_changed = old.access_token != new.access_token;
    if access_token_changed
        || old.groq_api_key != new.groq_api_key
        || old.stt_language != new.stt_language
        || old.stt_translate != new.stt_translate
    {
        *st.stt.lock().unwrap() = build_stt_client(new);
    }
    if access_token_changed || old.anthropic_api_key != new.anthropic_api_key {
        *st.llm.lock().unwrap() = build_llm_client(new);
    }
}

fn apply_screen_share_visibility_change(
    app: &AppHandle,
    old: &settings::Settings,
    new: &settings::Settings,
) {
    if old.screen_share_visible != new.screen_share_visible {
        if let Some(w) = app.get_webview_window(MAIN_WINDOW_LABEL) {
            let _ = w.set_content_protected(!new.screen_share_visible);
        }
    }
}

#[tauri::command]
fn move_window_by(app: AppHandle, dx: i32, dy: i32) {
    if let Some(w) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        if let Ok(pos) = w.outer_position() {
            let _ = w.set_position(tauri::PhysicalPosition::new(pos.x + dx, pos.y + dy));
        }
    }
}

struct ResizeTween {
    from_width: f64,
    to_width: f64,
    from_height: f64,
    to_height: f64,
    from_x: i32,
    to_x: i32,
    y: i32,
}

#[tauri::command]
fn set_window_size(app: AppHandle, width: f64, height: f64) {
    let Some(w) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return;
    };
    let scale = w.scale_factor().unwrap_or(1.0);
    let from_width = w.outer_size().map(|s| s.width as f64 / scale).unwrap_or(width);
    let from_height = w.outer_size().map(|s| s.height as f64 / scale).unwrap_or(height);
    let from_pos = w.outer_position().unwrap_or(tauri::PhysicalPosition::new(0, 0));

    if (from_width - width).abs() < RESIZE_EPSILON_LOGICAL_PX
        && (from_height - height).abs() < RESIZE_EPSILON_LOGICAL_PX
    {
        return;
    }

    let my_gen = app
        .state::<App>()
        .resize_gen
        .fetch_add(1, Ordering::SeqCst)
        + 1;
    let tween = ResizeTween {
        from_width,
        to_width: width,
        from_height,
        to_height: height,
        from_x: from_pos.x,
        to_x: anchored_target_x(&w, from_pos.x, width, scale),
        y: from_pos.y,
    };
    std::thread::spawn(move || run_resize_tween(app, w, tween, my_gen));
}

fn anchored_target_x(w: &tauri::WebviewWindow, from_x: i32, width: f64, scale: f64) -> i32 {
    let target_phys_w = (width * scale).round() as u32;
    let (mon_x, mon_w) = w
        .current_monitor()
        .ok()
        .flatten()
        .map(|m| (m.position().x, m.size().width))
        .unwrap_or((from_x, target_phys_w));
    window_geom::clamp_window_x(from_x, target_phys_w, mon_x, mon_w)
}

fn ease_out_cubic(t: f64) -> f64 {
    1.0 - (1.0 - t).powi(3)
}

fn run_resize_tween(app: AppHandle, w: tauri::WebviewWindow, tween: ResizeTween, my_gen: u64) {
    for i in 1..=RESIZE_TWEEN_STEPS {
        if app.state::<App>().resize_gen.load(Ordering::SeqCst) != my_gen {
            return;
        }
        let eased = ease_out_cubic(f64::from(i) / f64::from(RESIZE_TWEEN_STEPS));
        let cur_w = tween.from_width + (tween.to_width - tween.from_width) * eased;
        let cur_h = tween.from_height + (tween.to_height - tween.from_height) * eased;
        let cur_x = (f64::from(tween.from_x) + f64::from(tween.to_x - tween.from_x) * eased)
            .round() as i32;
        apply_window_frame(&app, &w, cur_x, tween.y, cur_w, cur_h);
        std::thread::sleep(RESIZE_TWEEN_FRAME_INTERVAL);
    }
    if app.state::<App>().resize_gen.load(Ordering::SeqCst) == my_gen {
        apply_window_frame(
            &app,
            &w,
            tween.to_x,
            tween.y,
            tween.to_width,
            tween.to_height,
        );
    }
}

fn apply_window_frame(
    app: &AppHandle,
    w: &tauri::WebviewWindow,
    x: i32,
    y: i32,
    width: f64,
    height: f64,
) {
    let win = w.clone();
    let _ = app.run_on_main_thread(move || {
        let _ = win.set_position(tauri::PhysicalPosition::new(x, y));
        let _ = win.set_size(tauri::LogicalSize::new(width, height));
    });
}

#[tauri::command]
fn set_ptt_suspended(app: AppHandle, suspended: bool) {
    let hk = app.state::<App>().settings.lock().unwrap().hotkey.clone();
    if suspended {
        hotkey::unregister_ptt(&app, &hk);
    } else {
        let _ = hotkey::register_ptt(&app, &hk);
    }
}

#[tauri::command]
fn close_app(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn hide_main_window(app: AppHandle) {
    if let Some(w) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = w.hide();
    }
}

#[tauri::command]
fn open_audio_permission_settings() {
    let _ = std::process::Command::new(OPEN_COMMAND)
        .arg(AUDIO_CAPTURE_PRIVACY_PANE_URL)
        .spawn();
}

fn is_web_url(url: &str) -> bool {
    url.starts_with(HTTPS_URL_PREFIX) || url.starts_with(HTTP_URL_PREFIX)
}

#[tauri::command]
fn open_external(url: String) {
    if is_web_url(&url) {
        let _ = std::process::Command::new(OPEN_COMMAND).arg(url).spawn();
    }
}

#[tauri::command]
fn capture_available(app: AppHandle) -> bool {
    app.state::<App>().capture.lock().unwrap().is_some()
}

#[tauri::command]
fn set_preview_html(app: AppHandle, html: String) {
    *app.state::<App>().preview_html.lock().unwrap() = html;
}

#[tauri::command]
async fn check_for_update(app: AppHandle) -> Result<Option<update::UpdateInfo>, String> {
    update::check(&app).await
}

#[tauri::command]
async fn install_update(app: AppHandle) -> Result<(), String> {
    update::install(app).await
}

#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").into()
}
