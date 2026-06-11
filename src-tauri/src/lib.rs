pub mod audio;
pub mod capture;
pub mod chats;
pub mod hotkey;
pub mod llm;
pub mod preview;
pub mod settings;
pub mod state;
pub mod stt;

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
            set_window_height,
            set_ptt_suspended,
            open_audio_permission_settings,
            open_external,
            capture_available,
            show_html_preview,
            get_preview_html,
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

/// Логические размеры окна превью; в физические переводятся через scale_factor.
const PREVIEW_LOGICAL_HEIGHT: f64 = 480.0;
const PREVIEW_GAP: f64 = 12.0;

/// Показывает HTML в синглтон-окне превью (label "preview"): создаёт окно над HUD
/// или заменяет содержимое уже открытого событием preview-html. focus=true — клик
/// по чипу (окно фокусируется), false — автооткрытие (фокус остаётся у HUD).
/// Синхронная команда выполняется на main thread — build()/set_position здесь
/// безопасны без run_on_main_thread (в отличие от анимации в set_window_height).
#[tauri::command]
fn show_html_preview(app: AppHandle, html: String, focus: bool) -> Result<(), String> {
    if html.trim().is_empty() {
        return Ok(());
    }
    *app.state::<App>().preview_html.lock().unwrap() = html.clone();

    if let Some(w) = app.get_webview_window("preview") {
        app.emit_to("preview", "preview-html", html)
            .map_err(|e| e.to_string())?;
        w.show().map_err(|e| e.to_string())?;
        if focus {
            let _ = w.set_focus();
        }
        return Ok(());
    }

    let main = app.get_webview_window("main").ok_or("нет окна main")?;
    let scale = main.scale_factor().unwrap_or(1.0);
    let pos = main.outer_position().map_err(|e| e.to_string())?;
    let size = main.outer_size().map_err(|e| e.to_string())?;
    let monitor_pos = main
        .current_monitor()
        .ok()
        .flatten()
        .map(|m| (m.position().x, m.position().y))
        .unwrap_or((0, 0));
    let (x, y, w, h) = preview::preview_rect(
        (pos.x, pos.y),
        (size.width, size.height),
        monitor_pos,
        (PREVIEW_LOGICAL_HEIGHT * scale) as u32,
        (PREVIEW_GAP * scale) as u32,
    );

    // Создаём скрытым, позиционируем физическими px, затем показываем — без скачка.
    let win = tauri::WebviewWindowBuilder::new(
        &app,
        "preview",
        tauri::WebviewUrl::App("index.html?window=preview".into()),
    )
    .title("Превью")
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .visible_on_all_workspaces(true)
    .content_protected(true)
    .resizable(true)
    .min_inner_size(360.0, 240.0)
    .visible(false)
    .build()
    .map_err(|e| e.to_string())?;
    win.set_position(tauri::PhysicalPosition::new(x, y))
        .map_err(|e| e.to_string())?;
    win.set_size(tauri::PhysicalSize::new(w, h))
        .map_err(|e| e.to_string())?;
    win.show().map_err(|e| e.to_string())?;
    if focus {
        let _ = win.set_focus();
    }
    Ok(())
}

#[tauri::command]
fn get_preview_html(app: AppHandle) -> String {
    app.state::<App>().preview_html.lock().unwrap().clone()
}

#[tauri::command]
fn move_window_by(app: AppHandle, dx: i32, dy: i32) {
    if let Some(w) = app.get_webview_window("main") {
        if let Ok(pos) = w.outer_position() {
            let _ = w.set_position(tauri::PhysicalPosition::new(pos.x + dx, pos.y + dy));
        }
    }
}

/// Плавно меняет высоту главного окна (логические px), сохраняя текущую ширину.
/// Анимация — ease-out-cubic за ~180мс: фоновый поток шлёт set_size по кадрам на
/// главный поток (UI-операции macOS обязаны быть на main thread). Генерация
/// (resize_gen) отменяет предыдущую анимацию при быстром повторном переключении.
/// Делается из Rust (как move_window_by), чтобы не требовать JS-капабилити set-size.
#[tauri::command]
fn set_window_height(app: AppHandle, height: f64) {
    let Some(w) = app.get_webview_window("main") else {
        return;
    };
    let scale = w.scale_factor().unwrap_or(1.0);
    let width = w.outer_size().map(|s| s.width as f64 / scale).unwrap_or(760.0);
    let from = w.outer_size().map(|s| s.height as f64 / scale).unwrap_or(height);
    if (from - height).abs() < 1.0 {
        return;
    }

    let my_gen = app
        .state::<App>()
        .resize_gen
        .fetch_add(1, Ordering::SeqCst)
        + 1;

    std::thread::spawn(move || {
        const STEPS: u32 = 14;
        for i in 1..=STEPS {
            // Новый ресайз начался — прекращаем устаревшую анимацию.
            if app.state::<App>().resize_gen.load(Ordering::SeqCst) != my_gen {
                return;
            }
            let t = f64::from(i) / f64::from(STEPS);
            let eased = 1.0 - (1.0 - t).powi(3); // ease-out cubic
            let h = from + (height - from) * eased;
            let win = w.clone();
            let _ = app.run_on_main_thread(move || {
                let _ = win.set_size(tauri::LogicalSize::new(win_width(&win, width), h));
            });
            std::thread::sleep(std::time::Duration::from_millis(13));
        }
        if app.state::<App>().resize_gen.load(Ordering::SeqCst) == my_gen {
            let win = w.clone();
            let _ = app.run_on_main_thread(move || {
                let _ = win.set_size(tauri::LogicalSize::new(win_width(&win, width), height));
            });
        }
    });
}

/// Текущая логическая ширина окна (на случай ручного ресайза во время анимации);
/// падает обратно на стартовую ширину.
fn win_width(win: &tauri::WebviewWindow, fallback: f64) -> f64 {
    let scale = win.scale_factor().unwrap_or(1.0);
    win.outer_size().map(|s| s.width as f64 / scale).unwrap_or(fallback)
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
