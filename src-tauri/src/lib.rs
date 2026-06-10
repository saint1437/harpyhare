pub mod audio;
pub mod capture;
pub mod hotkey;
pub mod llm;
pub mod settings;
pub mod state;
pub mod stt;

use std::sync::Mutex;
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
    pub llm_cancel: Mutex<Option<CancellationToken>>,
    pub stt: Mutex<stt::GroqStt>,
    pub llm: Mutex<llm::AnthropicClient>,
}

fn settings_path(app: &AppHandle) -> std::path::PathBuf {
    app.path()
        .app_data_dir()
        .expect("app_data_dir")
        .join("settings.json")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            let handle = app.handle();
            let settings = settings::Settings::load(&settings_path(handle))
                .unwrap_or_else(|_| settings::Settings::default());

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
                llm_cancel: Mutex::new(None),
                stt: Mutex::new(stt),
                llm: Mutex::new(llm),
            });

            if let Err(e) = hotkey::register_ptt(handle, &hotkey) {
                eprintln!("не удалось зарегистрировать PTT-хоткей {hotkey:?}: {e}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            send_to_claude,
            cancel_stream,
            retry_transcription,
            get_settings,
            set_settings,
            move_window_by,
            set_ptt_suspended,
            open_audio_permission_settings,
            capture_available,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// --- Эмиссия состояния + управление оверлеем ---------------------------------

fn emit_state(app: &AppHandle, s: state::RecorderState) {
    let _ = app.emit("state-changed", s);
    if let Some(w) = app.get_webview_window("overlay") {
        let _ = if s == state::RecorderState::Recording {
            w.show()
        } else {
            w.hide()
        };
    }
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
        hotkey::register_esc(app);
        emit_state(app, state::RecorderState::Recording);
        spawn_max_duration_watchdog(app.clone());
    }
}

pub fn on_ptt_released(app: &AppHandle) {
    let st = app.state::<App>();
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

fn spawn_max_duration_watchdog(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            let st = app.state::<App>();
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
async fn send_to_claude(app: AppHandle, text: String, images: Vec<llm::ImageAttachment>) {
    // Всё, что нужно из state, забираем ДО await: клонируем настройки/клиент,
    // токен кладём в state и тоже клонируем — никаких MutexGuard через await.
    let (model, system) = {
        let s = app.state::<App>();
        let s = s.settings.lock().unwrap();
        (s.model.clone(), s.system_prompt.clone())
    };
    let client = app.state::<App>().llm.lock().unwrap().clone();
    let cancel = CancellationToken::new();
    *app.state::<App>().llm_cancel.lock().unwrap() = Some(cancel.clone());
    let body = llm::build_request_body(&model, &system, &text, &images);
    let app2 = app.clone();
    let res = client
        .stream_message(body, cancel, move |delta| {
            let _ = app2.emit("llm-delta", delta);
        })
        .await;
    match res {
        Ok(()) => {
            let _ = app.emit("llm-done", ());
        }
        Err(llm::LlmError::Cancelled) => {
            let _ = app.emit("llm-done", ());
        }
        Err(e) => {
            let _ = app.emit("llm-error", e.to_string());
        }
    }
}

#[tauri::command]
fn cancel_stream(app: AppHandle) {
    if let Some(c) = app.state::<App>().llm_cancel.lock().unwrap().take() {
        c.cancel();
    }
}

#[tauri::command]
async fn retry_transcription(app: AppHandle) {
    let samples = app.state::<App>().last_recording.lock().unwrap().clone();
    if let Some(s) = samples {
        // Прогоняем машину Idle->Recording->Transcribing, чтобы PTT был заблокирован
        // на время ретрая. Гварды берём и отпускаем синхронно, до await.
        {
            let st = app.state::<App>();
            st.recorder.lock().unwrap().on(state::Event::PttPressed);
            st.recorder
                .lock()
                .unwrap()
                .on(state::Event::PttReleased { duration_secs: 1.0 });
        }
        emit_state(&app, state::RecorderState::Transcribing);
        transcribe_and_emit(app, s).await;
    }
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
        hotkey::unregister_ptt(&app, &old.hotkey);
        hotkey::register_ptt(&app, &new_settings.hotkey)?;
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
fn capture_available(app: AppHandle) -> bool {
    app.state::<App>().capture.lock().unwrap().is_some()
}
