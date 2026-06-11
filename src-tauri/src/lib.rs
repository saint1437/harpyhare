pub mod audio;
pub mod capture;
pub mod chats;
pub mod hotkey;
pub mod llm;
pub mod preview_protocol;
pub mod settings;
pub mod state;
pub mod stt;
pub mod window_geom;

use std::collections::HashMap;
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Mutex,
};
use tauri::{AppHandle, Emitter, Manager};
use tokio_util::sync::CancellationToken;

/// Глобальное состояние приложения. Держим под `Mutex` всё, что меняется из разных
/// потоков (хоткей-колбэки, async-команды, watchdog).
///
/// reqwest-клиенты (`stt`/`llm`) создаются один раз и переживают весь рантайм ради
/// пула соединений и переиспользования TLS. В команды они не пересоздаются — клон
/// шарит внутренний `Arc` пула; пересоздаём их только в `set_settings` при смене ключа.
pub struct App {
    pub settings: Mutex<settings::Settings>,
    pub recorder: Mutex<state::RecorderState>,
    pub capture: Mutex<Option<capture::SystemAudioCapture>>,
    pub last_recording: Mutex<Option<Vec<f32>>>, // 16к моно — для «Повторить»
    pub llm_cancel: Mutex<HashMap<String, CancellationToken>>,
    pub stt: Mutex<stt::GroqStt>,
    pub llm: Mutex<llm::AnthropicClient>,
    pub recording_gen: AtomicU64,
    pub resize_gen: AtomicU64,
    pub preview_html: Mutex<String>,
}

fn settings_path(app: &AppHandle) -> std::path::PathBuf {
    app.path()
        .app_data_dir()
        .expect("app_data_dir")
        .join("settings.json")
}

fn chats_path(app: &AppHandle) -> std::path::PathBuf {
    app.path()
        .app_data_dir()
        .expect("app_data_dir")
        .join("chats.json")
}

/// Полезные нагрузки LLM-событий несут chat_id, чтобы фронт роутил дельты по чатам.
/// camelCase — потому что фронт читает их как { chatId, ... }.
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
struct LlmError {
    chat_id: String,
    message: String,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .register_uri_scheme_protocol("preview", |ctx, _request| {
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
            let handle = app.handle();
            // .env в корне проекта. dotenvy::dotenv() ищет вверх от cwd (работает в dev),
            // но у .app, запущенного из Finder, cwd = "/" — поэтому добавочно пробуем
            // путь проекта, зашитый при компиляции (персональная сборка на этой же машине).
            let _ = dotenvy::dotenv();
            if let Some(project_env) = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .parent()
                .map(|root| root.join(".env"))
            {
                let _ = dotenvy::from_path(project_env);
            }
            let mut settings = settings::Settings::load(&settings_path(handle))
                .unwrap_or_else(|_| settings::Settings::default());
            // Ключи из .env подхватываются, только если в settings.json они пустые.
            settings.apply_key_fallback(
                std::env::var("ANTHROPIC_API_KEY").ok(),
                std::env::var("GROQ_API_KEY").ok(),
            );

            // Process tap создаётся один раз. При отказе TCC/ошибке — None в state,
            // UI покажет баннер (команда capture_available) и предложит открыть настройки.
            let capture = match capture::SystemAudioCapture::new() {
                Ok(c) => Some(c),
                Err(e) => {
                    eprintln!("захват системного звука недоступен: {e}");
                    None
                }
            };

            let stt = stt::GroqStt::new(settings.groq_api_key.clone());
            let llm = llm::AnthropicClient::new(settings.anthropic_api_key.clone());
            let hotkey = settings.hotkey.clone();

            app.manage(App {
                settings: Mutex::new(settings),
                recorder: Mutex::new(state::RecorderState::Idle),
                capture: Mutex::new(capture),
                last_recording: Mutex::new(None),
                llm_cancel: Mutex::new(HashMap::new()),
                stt: Mutex::new(stt),
                llm: Mutex::new(llm),
                recording_gen: AtomicU64::new(0),
                resize_gen: AtomicU64::new(0),
                preview_html: Mutex::new(String::new()),
            });

            if let Err(e) = hotkey::register_ptt(handle, &hotkey) {
                eprintln!("не удалось зарегистрировать PTT-хоткей {hotkey:?}: {e}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            send_to_claude,
            cancel_stream,
            load_chats,
            save_chats,
            retry_transcription,
            get_settings,
            set_settings,
            move_window_by,
            set_window_width,
            set_ptt_suspended,
            open_audio_permission_settings,
            open_external,
            capture_available,
            set_preview_html,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// --- Эмиссия состояния --------------------------------------------------------

fn emit_state(app: &AppHandle, s: state::RecorderState) {
    let _ = app.emit("state-changed", s);
}

// --- Обработчики хоткеев -------------------------------------------------------

pub fn on_ptt_pressed(app: &AppHandle) {
    let st = app.state::<App>();
    if st.capture.lock().unwrap().is_none() {
        let _ = app.emit("stt-error", "Нет разрешения на запись системного звука");
        return;
    }
    let action = st.recorder.lock().unwrap().on(state::Event::PttPressed);
    if action == state::Action::StartCapture {
        if let Some(c) = st.capture.lock().unwrap().as_mut() {
            if let Err(e) = c.start() {
                let _ = app.emit("stt-error", e.to_string());
                st.recorder.lock().unwrap().on(state::Event::Cancel);
                return;
            }
        }
        let gen = st.recording_gen.fetch_add(1, Ordering::SeqCst) + 1;
        hotkey::register_esc(app);
        emit_state(app, state::RecorderState::Recording);
        spawn_max_duration_watchdog(app.clone(), gen);
    }
}

pub fn on_ptt_released(app: &AppHandle) {
    let st = app.state::<App>();
    // recording_secs читается отдельным локом от recorder.on(): рассинхрон в пару мс
    // безвреден, а единственность c.stop() гарантирует FSM — кто первым перевёл
    // Recording→Transcribing, тот и останавливает capture (второй получит Action::None).
    let secs = st
        .capture
        .lock()
        .unwrap()
        .as_ref()
        .map(|c| c.recording_secs())
        .unwrap_or(0.0);
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
        if let Some(c) = st.capture.lock().unwrap().as_mut() {
            let _ = c.stop();
        }
        hotkey::unregister_esc(app);
        emit_state(app, state::RecorderState::Idle);
    }
}

// --- Завершение записи / распознавание ----------------------------------------

fn finish_recording(app: &AppHandle, action: state::Action) {
    let st = app.state::<App>();
    match action {
        state::Action::Discard => {
            if let Some(c) = st.capture.lock().unwrap().as_mut() {
                let _ = c.stop();
            }
            emit_state(app, state::RecorderState::Idle);
        }
        state::Action::Transcribe => {
            emit_state(app, state::RecorderState::Transcribing);
            let raw = st.capture.lock().unwrap().as_mut().map(|c| c.stop());
            let Some((buf, rate, ch)) = raw else {
                return finish_transcription(app, Err("нет аудио-буфера".into()));
            };
            let mono = audio::downmix_to_mono(&buf, ch);
            let s16k = match audio::resample_to_16k(&mono, rate) {
                Ok(v) => v,
                Err(e) => return finish_transcription(app, Err(e.to_string())),
            };
            if audio::is_silence(&s16k) {
                return finish_transcription(app, Err("Тишина — нечего распознавать".into()));
            }
            *st.last_recording.lock().unwrap() = Some(s16k.clone());
            let app2 = app.clone();
            tauri::async_runtime::spawn(async move { transcribe_and_emit(app2, s16k).await });
        }
        _ => {}
    }
}

async fn transcribe_and_emit(app: AppHandle, samples: Vec<f32>) {
    use stt::SttEngine;
    // Клонируем готовый клиент из state (шарит пул соединений), чтобы не держать
    // MutexGuard через .await.
    let stt_client = app.state::<App>().stt.lock().unwrap().clone();
    match stt_client.transcribe(&samples).await {
        Ok(text) => {
            use tauri_plugin_clipboard_manager::ClipboardExt;
            let _ = app.clipboard().write_text(text.clone());
            let _ = app.emit("transcript-ready", text);
            finish_transcription(&app, Ok(()));
        }
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
        let _ = app.emit("stt-error", msg);
    }
    emit_state(app, state::RecorderState::Idle);
}

fn spawn_max_duration_watchdog(app: AppHandle, my_gen: u64) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            let st = app.state::<App>();
            if st.recording_gen.load(Ordering::SeqCst) != my_gen {
                break;
            }
            if *st.recorder.lock().unwrap() != state::RecorderState::Recording {
                break;
            }
            let secs = st
                .capture
                .lock()
                .unwrap()
                .as_ref()
                .map(|c| c.recording_secs())
                .unwrap_or(0.0);
            if secs >= state::MAX_RECORDING_SECS {
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

// --- Команды ------------------------------------------------------------------

#[tauri::command]
async fn send_to_claude(app: AppHandle, messages: Vec<llm::ChatMessage>, chat_id: String) {
    let (model, system) = {
        let s = app.state::<App>();
        let s = s.settings.lock().unwrap();
        (s.model.clone(), s.system_prompt.clone())
    };
    let client = app.state::<App>().llm.lock().unwrap().clone();
    let cancel = CancellationToken::new();
    {
        let st = app.state::<App>();
        let mut map = st.llm_cancel.lock().unwrap();
        if let Some(old) = map.insert(chat_id.clone(), cancel.clone()) {
            old.cancel(); // повторный send в тот же чат отменяет прежний
        }
    }
    let body = llm::build_request_body(&model, &system, &messages);
    let app2 = app.clone();
    let cid = chat_id.clone();
    let res = client
        .stream_message(body, cancel, move |delta| {
            let _ = app2.emit(
                "llm-delta",
                LlmDelta { chat_id: cid.clone(), delta: delta.to_string() },
            );
        })
        .await;
    app.state::<App>().llm_cancel.lock().unwrap().remove(&chat_id);
    match res {
        Ok(()) | Err(llm::LlmError::Cancelled) => {
            let _ = app.emit("llm-done", LlmDone { chat_id });
        }
        Err(e) => {
            let _ = app.emit("llm-error", LlmError { chat_id, message: e.to_string() });
        }
    }
}

#[tauri::command]
fn cancel_stream(app: AppHandle, chat_id: String) {
    if let Some(c) = app.state::<App>().llm_cancel.lock().unwrap().remove(&chat_id) {
        c.cancel();
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
            return; // живая запись/транскрипция важнее ретрая
        }
        // прямой перевод: машина не имеет события "retry", а её инварианты
        // (PTT заблокирован в Transcribing) нам нужны и здесь
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
fn set_settings(app: AppHandle, mut new_settings: settings::Settings) -> Result<(), String> {
    new_settings.clamp();
    let st = app.state::<App>();
    let old = st.settings.lock().unwrap().clone();
    if old.hotkey != new_settings.hotkey {
        hotkey::register_ptt(&app, &new_settings.hotkey)?;
        hotkey::unregister_ptt(&app, &old.hotkey);
    }
    if old.groq_api_key != new_settings.groq_api_key {
        *st.stt.lock().unwrap() = stt::GroqStt::new(new_settings.groq_api_key.clone());
    }
    if old.anthropic_api_key != new_settings.anthropic_api_key {
        *st.llm.lock().unwrap() = llm::AnthropicClient::new(new_settings.anthropic_api_key.clone());
    }
    new_settings
        .save(&settings_path(&app))
        .map_err(|e| e.to_string())?;
    *st.settings.lock().unwrap() = new_settings;
    Ok(())
}

#[tauri::command]
fn move_window_by(app: AppHandle, dx: i32, dy: i32) {
    if let Some(w) = app.get_webview_window("main") {
        if let Ok(pos) = w.outer_position() {
            let _ = w.set_position(tauri::PhysicalPosition::new(pos.x + dx, pos.y + dy));
        }
    }
}

/// Плавно меняет ширину главного окна (логические px), сохраняя высоту. Растёт вправо
/// (якорь — левый край); если правый край выходит за монитор — окно сдвигается влево
/// (кламп через window_geom::clamp_window_x). Ease-out-твин на фоновом потоке
/// с guard-генератором resize_gen.
#[tauri::command]
fn set_window_width(app: AppHandle, width: f64) {
    let Some(w) = app.get_webview_window("main") else {
        return;
    };
    let scale = w.scale_factor().unwrap_or(1.0);
    let from_w = w.outer_size().map(|s| s.width as f64 / scale).unwrap_or(width);
    let height = w.outer_size().map(|s| s.height as f64 / scale).unwrap_or(640.0);
    let from_pos = w.outer_position().unwrap_or(tauri::PhysicalPosition::new(0, 0));

    // Целевой x с клампом по правому краю текущего монитора (физ. px).
    let target_phys_w = (width * scale).round() as u32;
    let (mon_x, mon_w) = w
        .current_monitor()
        .ok()
        .flatten()
        .map(|m| (m.position().x, m.size().width))
        .unwrap_or((from_pos.x, target_phys_w));
    let target_x = window_geom::clamp_window_x(from_pos.x, target_phys_w, mon_x, mon_w);

    if (from_w - width).abs() < 1.0 && from_pos.x == target_x {
        return;
    }
    let from_x = from_pos.x;
    let y = from_pos.y;

    let my_gen = app
        .state::<App>()
        .resize_gen
        .fetch_add(1, Ordering::SeqCst)
        + 1;

    std::thread::spawn(move || {
        const STEPS: u32 = 14;
        for i in 1..=STEPS {
            if app.state::<App>().resize_gen.load(Ordering::SeqCst) != my_gen {
                return;
            }
            let t = f64::from(i) / f64::from(STEPS);
            let eased = 1.0 - (1.0 - t).powi(3); // ease-out cubic
            let cur_w = from_w + (width - from_w) * eased;
            let cur_x = (f64::from(from_x) + f64::from(target_x - from_x) * eased).round() as i32;
            let win = w.clone();
            let _ = app.run_on_main_thread(move || {
                let _ = win.set_position(tauri::PhysicalPosition::new(cur_x, y));
                let _ = win.set_size(tauri::LogicalSize::new(cur_w, height));
            });
            std::thread::sleep(std::time::Duration::from_millis(13));
        }
        if app.state::<App>().resize_gen.load(Ordering::SeqCst) == my_gen {
            let win = w.clone();
            let _ = app.run_on_main_thread(move || {
                let _ = win.set_position(tauri::PhysicalPosition::new(target_x, y));
                let _ = win.set_size(tauri::LogicalSize::new(width, height));
            });
        }
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
fn open_audio_permission_settings() {
    let _ = std::process::Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_AudioCapture")
        .spawn();
}

#[tauri::command]
fn open_external(url: String) {
    // только web-ссылки: не даём открывать file://, smb:// и т.п.
    if url.starts_with("https://") || url.starts_with("http://") {
        let _ = std::process::Command::new("open").arg(url).spawn();
    }
}

#[tauri::command]
fn capture_available(app: AppHandle) -> bool {
    app.state::<App>().capture.lock().unwrap().is_some()
}

/// Сохраняет HTML, который отдаст кастомная схема preview:// при следующем запросе.
#[tauri::command]
fn set_preview_html(app: AppHandle, html: String) {
    *app.state::<App>().preview_html.lock().unwrap() = html;
}
