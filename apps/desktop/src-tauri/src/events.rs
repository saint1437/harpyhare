use tauri::{AppHandle, Emitter};

use crate::error::{AppError, ErrorCode};
use crate::settings::PromptPreset;
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

#[derive(Clone, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotReady {
    pub media_type: String,
    pub data_base64: String,
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
    pub at_ms: f64,
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

pub fn auto_turn(app: &AppHandle, payload: AutoTurnPayload) {
    let _ = app.emit(EVENT_AUTO_TURN, payload);
}

pub fn auto_mode_changed(app: &AppHandle, active: bool) {
    let _ = app.emit(EVENT_AUTO_MODE_CHANGED, AutoModeChanged { active });
}

pub fn auto_mode_error(app: &AppHandle, error: AppError) {
    let _ = app.emit(EVENT_AUTO_MODE_ERROR, error);
}

// Хоткей ответа глобальный, а накопленные реплики живут во фронтенде: бэкенд
// только сообщает о нажатии, решение «что именно отправить» остаётся там же,
// где лежит расшифровка.
pub fn auto_answer(app: &AppHandle) {
    let _ = app.emit(EVENT_AUTO_ANSWER, ());
}

#[derive(Clone, serde::Serialize, specta::Type)]
pub struct CollapsedChanged {
    pub collapsed: bool,
}

pub fn collapsed_changed(app: &AppHandle, collapsed: bool) {
    let _ = app.emit(EVENT_COLLAPSED_CHANGED, CollapsedChanged { collapsed });
}

pub fn audio_level(app: &AppHandle, level: f32) {
    let _ = app.emit(EVENT_AUDIO_LEVEL, AudioLevel { level });
}

pub fn state_changed(app: &AppHandle, state: RecorderState) {
    let _ = app.emit(EVENT_STATE_CHANGED, state);
}

pub fn transcript_ready(app: &AppHandle, text: String) {
    let _ = app.emit(EVENT_TRANSCRIPT_READY, text);
}

pub fn stt_error(app: &AppHandle, error: AppError) {
    let _ = app.emit(EVENT_STT_ERROR, error);
}

pub fn llm_delta(app: &AppHandle, chat_id: &str, delta: String) {
    let _ = app.emit(
        EVENT_LLM_DELTA,
        LlmDelta {
            chat_id: chat_id.to_string(),
            delta,
        },
    );
}

pub fn llm_done(app: &AppHandle, chat_id: String) {
    let _ = app.emit(EVENT_LLM_DONE, LlmDone { chat_id });
}

pub fn llm_error(app: &AppHandle, chat_id: String, error: AppError) {
    let _ = app.emit(
        EVENT_LLM_ERROR,
        LlmErrorEvent {
            chat_id,
            code: error.code,
            message: error.message,
        },
    );
}

pub fn llm_usage(app: &AppHandle, chat_id: &str, input_tokens: u32) {
    let _ = app.emit(
        EVENT_LLM_USAGE,
        LlmUsage {
            chat_id: chat_id.to_string(),
            input_tokens,
        },
    );
}

pub fn screenshot_ready(app: &AppHandle, payload: ScreenshotReady) {
    let _ = app.emit(EVENT_SCREENSHOT_READY, payload);
}

pub fn screenshot_error(app: &AppHandle, error: AppError) {
    let _ = app.emit(EVENT_SCREENSHOT_ERROR, error);
}

pub fn toggle_teleprompter(app: &AppHandle) {
    let _ = app.emit(EVENT_TOGGLE_TELEPROMPTER, ());
}

pub fn focus_prompt(app: &AppHandle) {
    let _ = app.emit(EVENT_FOCUS_PROMPT, ());
}

pub fn resize_key(app: &AppHandle, dx: i32, dy: i32) {
    let (dim, dir) = if dx != 0 {
        (ResizeDim::Width, dx)
    } else {
        (ResizeDim::Height, dy)
    };
    let _ = app.emit(EVENT_RESIZE_KEY, ResizeKeyPayload { dim, dir });
}

pub fn update_available(app: &AppHandle, info: UpdateInfo) {
    let _ = app.emit(EVENT_UPDATE_AVAILABLE, info);
}

pub fn update_progress(app: &AppHandle, downloaded: u64, total: Option<u64>) {
    let _ = app.emit(EVENT_UPDATE_PROGRESS, UpdateProgress { downloaded, total });
}

pub fn update_done(app: &AppHandle, version: String) {
    let _ = app.emit(EVENT_UPDATE_DONE, UpdateDone { version });
}

pub fn official_presets_updated(app: &AppHandle, presets: Vec<PromptPreset>) {
    let _ = app.emit(EVENT_OFFICIAL_PRESETS_UPDATED, presets);
}
