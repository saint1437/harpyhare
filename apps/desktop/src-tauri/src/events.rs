use tauri::{AppHandle, Emitter};

use crate::error::{AppError, ErrorCode};
use crate::remote_presets::PresetList;
use crate::state::RecorderState;
use crate::update::UpdateInfo;

const EVENT_STATE_CHANGED: &str = "state-changed";
const EVENT_TRANSCRIPT_READY: &str = "transcript-ready";
const EVENT_STT_ERROR: &str = "stt-error";
const EVENT_LLM_DELTA: &str = "llm-delta";
const EVENT_LLM_DONE: &str = "llm-done";
const EVENT_LLM_ERROR: &str = "llm-error";
const EVENT_LLM_USAGE: &str = "llm-usage";
const EVENT_TOGGLE_TELEPROMPTER: &str = "toggle-teleprompter";
const EVENT_RESIZE_KEY: &str = "resize-key";
const EVENT_UPDATE_AVAILABLE: &str = "update-available";
const EVENT_UPDATE_PROGRESS: &str = "update-progress";
const EVENT_UPDATE_DONE: &str = "update-done";
const EVENT_OFFICIAL_PRESETS_UPDATED: &str = "official-presets-updated";
const EVENT_SCREENSHOT_READY: &str = "screenshot-ready";
const EVENT_SCREENSHOT_ERROR: &str = "screenshot-error";
const EVENT_FOCUS_PROMPT: &str = "focus-prompt";
const EVENT_AUTO_TURN: &str = "auto-turn";
const EVENT_AUTO_MODE_CHANGED: &str = "auto-mode-changed";
const EVENT_AUTO_MODE_ERROR: &str = "auto-mode-error";
const EVENT_AUTO_ANSWER: &str = "auto-answer";
const EVENT_AUDIO_LEVEL: &str = "audio-level";
const EVENT_COLLAPSED_CHANGED: &str = "collapsed-changed";

/// The port every event leaves through.
///
/// `Emitter` is imported in exactly one file (this one) so that the event names
/// and their payload structs cannot drift apart — that invariant is older than
/// this trait. What the trait adds is a seam: the domain code emits through a
/// bus rather than through a live `AppHandle`, so a test can watch what a
/// pipeline reports without constructing a Tauri application (which is why
/// `recording.rs`, `chat.rs` and `window.rs` had no tests at all).
///
/// `AppHandle` implements it directly rather than being wrapped in a
/// `TauriEventBus(AppHandle)`: the handle IS the Tauri event bus, and a wrapper
/// would have meant touching all sixty-odd call sites for no behaviour.
pub trait EventBus {
    fn emit_event<P: serde::Serialize + Clone>(&self, name: &str, payload: P);
}

impl EventBus for AppHandle {
    fn emit_event<P: serde::Serialize + Clone>(&self, name: &str, payload: P) {
        let _ = self.emit(name, payload);
    }
}

/// The fake. Records what was emitted, in order, as (name, json).
#[cfg(test)]
#[derive(Default)]
pub struct RecordedEvents {
    emitted: std::sync::Mutex<Vec<(String, serde_json::Value)>>,
}

#[cfg(test)]
impl RecordedEvents {
    pub fn names(&self) -> Vec<String> {
        use crate::sync::MutexExt;
        self.emitted.lock_safe().iter().map(|(n, _)| n.clone()).collect()
    }

    pub fn payload(&self, name: &str) -> Option<serde_json::Value> {
        use crate::sync::MutexExt;
        self.emitted
            .lock_safe()
            .iter()
            .find(|(n, _)| n == name)
            .map(|(_, v)| v.clone())
    }
}

#[cfg(test)]
impl EventBus for RecordedEvents {
    fn emit_event<P: serde::Serialize + Clone>(&self, name: &str, payload: P) {
        use crate::sync::MutexExt;
        let value = serde_json::to_value(payload).unwrap_or(serde_json::Value::Null);
        self.emitted.lock_safe().push((name.to_string(), value));
    }
}

/// A REFERENCE into the chat-image store, not the picture.
///
/// The shot is already on disk by the time this goes out (`screenshot::deliver`),
/// so what crosses the boundary is an id the frontend resolves through
/// `load_chat_images` — the very path a chat restored from disk takes. The
/// payload used to carry the whole PNG as base64, which the frontend decoded,
/// re-encoded and shipped straight back to `save_chat_image` for this same
/// store to write.
#[derive(Clone, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotReady {
    pub id: String,
    pub media_type: String,
}

#[derive(Clone, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LlmDelta {
    pub chat_id: String,
    pub delta: String,
}

#[derive(Clone, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LlmDone {
    pub chat_id: String,
}

#[derive(Clone, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LlmUsage {
    pub chat_id: String,
    pub input_tokens: u32,
}

#[derive(Clone, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LlmErrorEvent {
    pub chat_id: String,
    pub code: ErrorCode,
    pub message: String,
    /// The machine values the frontend's template needs. Listed explicitly like
    /// the two fields above rather than `serde(flatten)`ed — specta will not
    /// export a flattened type — and `default` so the frontend's optional
    /// `AppError.params` and this event stay the same shape.
    #[serde(default)]
    pub params: crate::error::ErrorParams,
}

#[derive(Clone, Copy, serde::Serialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum ResizeDim {
    Width,
    Height,
}

#[derive(Clone, serde::Serialize, specta::Type)]
pub struct ResizeKeyPayload {
    pub dim: ResizeDim,
    pub dir: i32,
}

#[derive(Clone, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProgress {
    #[specta(type = f64)]
    pub downloaded: u64,
    #[specta(type = Option<f64>)]
    pub total: Option<u64>,
}

#[derive(Clone, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDone {
    pub version: String,
}

#[derive(Clone, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AutoTurnPayload {
    pub speaker: crate::auto::Speaker,
    pub text: String,
    pub seq: u32,
}

#[derive(Clone, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AutoModeChanged {
    pub active: bool,
}

#[derive(Clone, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AudioLevel {
    pub level: f32,
}

pub fn auto_turn(bus: &impl EventBus, payload: AutoTurnPayload) {
    bus.emit_event(EVENT_AUTO_TURN, payload);
}

pub fn auto_mode_changed(bus: &impl EventBus, active: bool) {
    bus.emit_event(EVENT_AUTO_MODE_CHANGED, AutoModeChanged { active });
}

pub fn auto_mode_error(bus: &impl EventBus, error: AppError) {
    bus.emit_event(EVENT_AUTO_MODE_ERROR, error);
}

// Хоткей ответа глобальный, а накопленные реплики живут во фронтенде: бэкенд
// только сообщает о нажатии, решение «что именно отправить» остаётся там же,
// где лежит расшифровка.
pub fn auto_answer(bus: &impl EventBus) {
    bus.emit_event(EVENT_AUTO_ANSWER, ());
}

#[derive(Clone, serde::Serialize, specta::Type)]
pub struct CollapsedChanged {
    pub collapsed: bool,
}

pub fn collapsed_changed(bus: &impl EventBus, collapsed: bool) {
    bus.emit_event(EVENT_COLLAPSED_CHANGED, CollapsedChanged { collapsed });
}

pub fn audio_level(bus: &impl EventBus, level: f32) {
    bus.emit_event(EVENT_AUDIO_LEVEL, AudioLevel { level });
}

pub fn state_changed(bus: &impl EventBus, state: RecorderState) {
    bus.emit_event(EVENT_STATE_CHANGED, state);
}

pub fn transcript_ready(bus: &impl EventBus, text: String) {
    bus.emit_event(EVENT_TRANSCRIPT_READY, text);
}

pub fn stt_error(bus: &impl EventBus, error: AppError) {
    bus.emit_event(EVENT_STT_ERROR, error);
}

pub fn llm_delta(bus: &impl EventBus, chat_id: &str, delta: String) {
    bus.emit_event(
        EVENT_LLM_DELTA,
        LlmDelta {
            chat_id: chat_id.to_string(),
            delta,
        },
    );
}

pub fn llm_done(bus: &impl EventBus, chat_id: String) {
    bus.emit_event(EVENT_LLM_DONE, LlmDone { chat_id });
}

pub fn llm_error(bus: &impl EventBus, chat_id: String, error: AppError) {
    bus.emit_event(
        EVENT_LLM_ERROR,
        LlmErrorEvent {
            chat_id,
            code: error.code,
            message: error.message,
            params: error.params,
        },
    );
}

pub fn llm_usage(bus: &impl EventBus, chat_id: &str, input_tokens: u32) {
    bus.emit_event(
        EVENT_LLM_USAGE,
        LlmUsage {
            chat_id: chat_id.to_string(),
            input_tokens,
        },
    );
}

pub fn screenshot_ready(bus: &impl EventBus, payload: ScreenshotReady) {
    bus.emit_event(EVENT_SCREENSHOT_READY, payload);
}

pub fn screenshot_error(bus: &impl EventBus, error: AppError) {
    bus.emit_event(EVENT_SCREENSHOT_ERROR, error);
}

pub fn toggle_teleprompter(bus: &impl EventBus) {
    bus.emit_event(EVENT_TOGGLE_TELEPROMPTER, ());
}

pub fn focus_prompt(bus: &impl EventBus) {
    bus.emit_event(EVENT_FOCUS_PROMPT, ());
}

pub fn resize_key(bus: &impl EventBus, dx: i32, dy: i32) {
    let (dim, dir) = if dx != 0 {
        (ResizeDim::Width, dx)
    } else {
        (ResizeDim::Height, dy)
    };
    bus.emit_event(EVENT_RESIZE_KEY, ResizeKeyPayload { dim, dir });
}

pub fn update_available(bus: &impl EventBus, info: UpdateInfo) {
    bus.emit_event(EVENT_UPDATE_AVAILABLE, info);
}

pub fn update_progress(bus: &impl EventBus, downloaded: u64, total: Option<u64>) {
    bus.emit_event(EVENT_UPDATE_PROGRESS, UpdateProgress { downloaded, total });
}

pub fn update_done(bus: &impl EventBus, version: String) {
    bus.emit_event(EVENT_UPDATE_DONE, UpdateDone { version });
}

/// The payload is the shared pool, not a copy of it: this fires on every
/// 30-minute refresh that changed anything, and the pool is up to ~145 KB of
/// preset text. It still serializes as a plain `PromptPreset[]`.
pub fn official_presets_updated(bus: &impl EventBus, presets: PresetList) {
    bus.emit_event(EVENT_OFFICIAL_PRESETS_UPDATED, presets);
}

#[cfg(test)]
mod tests;
