use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::{AppHandle, Manager};
use tokio_util::sync::CancellationToken;

use crate::app_state::{llm_provider, App};
use crate::error::AppError;
use crate::{events, llm};
use crate::sync::MutexExt;

const LLM_DELTA_FLUSH_INTERVAL: Duration = Duration::from_millis(25);

/// Whether this epoch is still the live stream of that chat. The registry and
/// the reason it needs epochs at all live in `llm_service.rs`.
pub fn is_current_stream(app: &AppHandle, chat_id: &str, epoch: u64) -> bool {
    app.state::<App>().llm.is_current_stream(chat_id, epoch)
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

fn spawn_llm_delta_flusher(app: AppHandle, chat_id: String, epoch: u64) -> LlmDeltaFlusher {
    let pending = Arc::new(Mutex::new(String::new()));
    let stop = CancellationToken::new();
    let task = {
        let pending = Arc::clone(&pending);
        let stop = stop.clone();
        tauri::async_runtime::spawn(async move {
            run_llm_delta_flusher(app, chat_id, epoch, pending, stop).await;
        })
    };
    LlmDeltaFlusher { pending, stop, task }
}

async fn run_llm_delta_flusher(
    app: AppHandle,
    chat_id: String,
    epoch: u64,
    pending: Arc<Mutex<String>>,
    stop: CancellationToken,
) {
    let mut tick = tokio::time::interval(LLM_DELTA_FLUSH_INTERVAL);
    loop {
        tokio::select! {
            _ = tick.tick() => {}
            _ = stop.cancelled() => break,
        }
        flush_pending_delta(&app, &chat_id, epoch, &pending);
    }
    flush_pending_delta(&app, &chat_id, epoch, &pending);
}

fn flush_pending_delta(app: &AppHandle, chat_id: &str, epoch: u64, pending: &Mutex<String>) {
    let delta = std::mem::take(&mut *pending.lock_safe());
    if delta.is_empty() || !is_current_stream(app, chat_id, epoch) {
        return;
    }
    events::llm_delta(app, chat_id, delta);
}

fn emit_llm_result(app: &AppHandle, chat_id: String, epoch: u64, res: Result<(), llm::LlmError>) {
    if !is_current_stream(app, &chat_id, epoch) {
        return;
    }
    match res {
        Ok(()) | Err(llm::LlmError::Cancelled) => events::llm_done(app, chat_id),
        Err(e) => events::llm_error(app, chat_id, AppError::from(&e)),
    }
}

struct ChatStreamSink {
    app: AppHandle,
    chat_id: String,
    epoch: u64,
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
        self.pending.lock_safe().push_str(delta);
    }

    fn input_tokens(&mut self, total: u32) {
        if !is_current_stream(&self.app, &self.chat_id, self.epoch) {
            return;
        }
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
    let (epoch, cancel) = app.state::<App>().llm.begin_stream(&chat_id);
    let request = llm::LlmRequest {
        model,
        system,
        messages,
        options,
    };

    let flusher = spawn_llm_delta_flusher(app.clone(), chat_id.clone(), epoch);
    let started = std::time::Instant::now();
    let mut sink = ChatStreamSink {
        app: app.clone(),
        chat_id: chat_id.clone(),
        epoch,
        pending: Arc::clone(&flusher.pending),
        started,
        got_first_delta: false,
    };
    let res = provider.stream(request, cancel, &mut sink).await;
    flusher.stop_and_await_final_drain().await;
    eprintln!("[perf] llm stream total {:?}", started.elapsed());
    emit_llm_result(&app, chat_id.clone(), epoch, res);
    app.state::<App>().llm.end_stream(&chat_id, epoch);
}

#[tauri::command]
#[specta::specta]
pub async fn count_chat_tokens(
    app: AppHandle,
    messages: Vec<llm::ChatMessage>,
    system: String,
    model: String,
    options: llm::RequestOptions,
) -> Result<u32, AppError> {
    // The code, not just the prose: this command feeds the context-fullness
    // indicator, and the frontend has to tell "no network" from "the key is
    // wrong" to decide whether hiding the gauge is temporary.
    llm_provider(&app)
        .count_tokens(llm::LlmRequest {
            model,
            system,
            messages,
            options,
        })
        .await
        .map_err(AppError::from)
}

#[tauri::command]
#[specta::specta]
pub fn cancel_stream(app: AppHandle, chat_id: String) {
    app.state::<App>().llm.cancel_stream(&chat_id);
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
        _ => app.state::<App>().llm.cached_models(),
    }
}
