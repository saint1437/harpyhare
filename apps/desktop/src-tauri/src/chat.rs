use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::{AppHandle, Manager};
use tokio_util::sync::CancellationToken;

use crate::app_state::{llm_provider, App};
use crate::error::AppError;
use crate::{events, llm};

const LLM_DELTA_FLUSH_INTERVAL: Duration = Duration::from_millis(25);

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
        events::llm_delta(app, chat_id, delta);
    }
}

fn emit_llm_result(app: &AppHandle, chat_id: String, res: Result<(), llm::LlmError>) {
    match res {
        Ok(()) | Err(llm::LlmError::Cancelled) => events::llm_done(app, chat_id),
        Err(e) => events::llm_error(app, chat_id, AppError::from(&e)),
    }
}

struct ChatStreamSink {
    app: AppHandle,
    chat_id: String,
    pending: Arc<Mutex<String>>,
    started: std::time::Instant,
    got_first_delta: bool,
}

impl llm::LlmStreamSink for ChatStreamSink {
    fn text_delta(&mut self, delta: &str) {
        if !self.got_first_delta {
            self.got_first_delta = true;
            eprintln!(
                "[perf] llm ttfb (первая текстовая дельта) {:?}",
                self.started.elapsed()
            );
        }
        self.pending.lock().unwrap().push_str(delta);
    }

    fn input_tokens(&mut self, total: u32) {
        events::llm_usage(&self.app, &self.chat_id, total);
    }
}

#[tauri::command]
#[specta::specta]
pub async fn send_to_claude(
    app: AppHandle,
    messages: Vec<llm::ChatMessage>,
    chat_id: String,
    system: String,
    model: String,
    options: llm::RequestOptions,
) {
    let provider = llm_provider(&app);
    let cancel = register_llm_cancel(&app, &chat_id);
    let request = llm::LlmRequest {
        model,
        system,
        messages,
        options,
    };

    let flusher = spawn_llm_delta_flusher(app.clone(), chat_id.clone());
    let started = std::time::Instant::now();
    let mut sink = ChatStreamSink {
        app: app.clone(),
        chat_id: chat_id.clone(),
        pending: Arc::clone(&flusher.pending),
        started,
        got_first_delta: false,
    };
    let res = provider.stream(request, cancel, &mut sink).await;
    flusher.stop_and_await_final_drain().await;
    eprintln!("[perf] llm stream total {:?}", started.elapsed());
    unregister_llm_cancel(&app, &chat_id);
    emit_llm_result(&app, chat_id, res);
}

#[tauri::command]
#[specta::specta]
pub async fn count_chat_tokens(
    app: AppHandle,
    messages: Vec<llm::ChatMessage>,
    system: String,
    model: String,
    options: llm::RequestOptions,
) -> Result<u32, String> {
    llm_provider(&app)
        .count_tokens(llm::LlmRequest {
            model,
            system,
            messages,
            options,
        })
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub fn cancel_stream(app: AppHandle, chat_id: String) {
    if let Some(c) = app.state::<App>().llm_cancel.lock().unwrap().remove(&chat_id) {
        c.cancel();
    }
}

#[tauri::command]
#[specta::specta]
pub async fn probe_connectivity(app: AppHandle) -> bool {
    llm_provider(&app).reachable().await
}

#[tauri::command]
#[specta::specta]
pub async fn list_models(app: AppHandle) -> Vec<llm::ModelInfo> {
    match llm_provider(&app).list_models().await {
        Ok(models) if !models.is_empty() => models,
        _ => app.state::<App>().models.lock().unwrap().clone(),
    }
}
