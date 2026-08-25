use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

#[cfg(unix)]
const OWNER_ONLY_FILE_MODE: u32 = 0o600;
pub(crate) const TMP_FILE_EXTENSION: &str = "tmp";

static TMP_FILE_SEQUENCE: AtomicU64 = AtomicU64::new(0);

/// `system` follows the OS; the two explicit values pin it. The former
/// `gray`/`black` pair were two dark themes 0.05 lightness apart and retired
/// when the palette gained a real light half — `migrate_legacy_theme` maps them.
pub const THEME_SYSTEM: &str = "system";
pub const THEME_LIGHT: &str = "light";
pub const THEME_DARK: &str = "dark";
pub const LEGACY_THEME_GRAY: &str = "gray";
pub const LEGACY_THEME_BLACK: &str = "black";

pub const QUICK_ACTION_LIMIT: usize = 9;

#[derive(Debug, Clone, Copy, PartialEq, Serialize, specta::Type)]
pub struct Bounds<T> {
    pub default: T,
    pub min: T,
    pub max: T,
}

impl Bounds<f64> {
    pub fn clamp(&self, value: f64) -> f64 {
        if value.is_finite() {
            value.clamp(self.min, self.max)
        } else {
            self.default
        }
    }
}

impl Bounds<u32> {
    pub fn clamp(&self, value: u32) -> u32 {
        value.clamp(self.min, self.max)
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SettingsLimits {
    pub window_width: Bounds<f64>,
    pub window_height: Bounds<f64>,
    pub window_opacity: Bounds<f64>,
    pub move_step: Bounds<u32>,
    pub resize_step: Bounds<u32>,
    pub chat_font_size: Bounds<f64>,
    pub scroll_step: Bounds<u32>,
    pub teleprompter_speed: Bounds<f64>,
    pub teleprompter_font_size: Bounds<f64>,
    pub buffer_seconds: Bounds<u32>,
    pub auto_silence_ms: Bounds<u32>,
    pub auto_min_utterance_ms: Bounds<u32>,
    pub auto_max_utterance_secs: Bounds<u32>,
}

impl SettingsLimits {
    pub fn current() -> Self {
        Self {
            window_width: limits::window::WIDTH,
            window_height: limits::window::HEIGHT,
            window_opacity: limits::window::OPACITY,
            move_step: limits::window::MOVE_STEP,
            resize_step: limits::window::RESIZE_STEP,
            chat_font_size: limits::chat::FONT_SIZE,
            scroll_step: limits::chat::SCROLL_STEP,
            teleprompter_speed: limits::teleprompter::SPEED,
            teleprompter_font_size: limits::teleprompter::FONT_SIZE,
            buffer_seconds: limits::capture::BUFFER_SECONDS,
            auto_silence_ms: limits::capture::AUTO_SILENCE_MS,
            auto_min_utterance_ms: limits::capture::AUTO_MIN_UTTERANCE_MS,
            auto_max_utterance_secs: limits::capture::AUTO_MAX_UTTERANCE_SECS,
        }
    }
}

pub mod defaults {
    pub const STT_LANGUAGE: &str = "ru";
    pub const THEME: &str = super::THEME_SYSTEM;
}

pub mod limits {
    use super::Bounds;

    pub mod window {
        use super::Bounds;
        pub const WIDTH: Bounds<f64> = Bounds { default: 960.0, min: 300.0, max: 1600.0 };
        pub const HEIGHT: Bounds<f64> = Bounds { default: 680.0, min: 520.0, max: 1100.0 };
        pub const OPACITY: Bounds<f64> = Bounds { default: 0.9, min: 0.75, max: 1.0 };
        pub const MOVE_STEP: Bounds<u32> = Bounds { default: 20, min: 1, max: 200 };
        pub const RESIZE_STEP: Bounds<u32> = Bounds { default: 20, min: 1, max: 200 };
    }

    pub mod chat {
        use super::Bounds;
        pub const FONT_SIZE: Bounds<f64> = Bounds { default: 13.5, min: 10.0, max: 20.0 };
        pub const SCROLL_STEP: Bounds<u32> = Bounds { default: 120, min: 10, max: 1000 };
    }

    pub mod teleprompter {
        use super::Bounds;
        pub const SPEED: Bounds<f64> = Bounds { default: 40.0, min: 10.0, max: 150.0 };
        pub const FONT_SIZE: Bounds<f64> = Bounds { default: 28.0, min: 20.0, max: 48.0 };
    }

    pub mod capture {
        use super::Bounds;
        pub const BUFFER_SECONDS: Bounds<u32> = Bounds { default: 4, min: 4, max: 10 };
        pub const AUTO_SILENCE_MS: Bounds<u32> = Bounds { default: 700, min: 300, max: 2000 };
        pub const AUTO_MIN_UTTERANCE_MS: Bounds<u32> = Bounds { default: 400, min: 200, max: 3000 };
        pub const AUTO_MAX_UTTERANCE_SECS: Bounds<u32> = Bounds { default: 30, min: 5, max: 120 };
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct PromptPreset {
    pub id: String,
    pub name: String,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct QuickAction {
    pub id: String,
    pub title: String,
    pub prompt: String,
}

struct QuickActionSeed {
    id: &'static str,
    title: &'static str,
    prompt: &'static str,
}

const QUICK_ACTION_SEEDS: &[QuickActionSeed] = &[
    QuickActionSeed { id: "detail", title: "Подробнее", prompt: "Расскажи более подробно." },
    QuickActionSeed { id: "brief", title: "Короче", prompt: "Ответь короче, только суть." },
    QuickActionSeed { id: "code", title: "Пример кода", prompt: "Покажи пример кода." },
];

fn seeded_quick_actions() -> Vec<QuickAction> {
    QUICK_ACTION_SEEDS
        .iter()
        .map(|seed| QuickAction {
            id: seed.id.into(),
            title: seed.title.into(),
            prompt: seed.prompt.into(),
        })
        .collect()
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(default)]
pub struct Settings {
    pub anthropic_api_key: String,
    pub groq_api_key: String,
    pub access_token: String,
    pub prompt_presets: Vec<PromptPreset>,
    pub hotkeys: Vec<crate::hotkeys::HotkeyBinding>,
    pub auto_send: bool,
    pub window_opacity: f64,
    pub move_step: u32,
    pub auto_preview_html: bool,
    pub chat_font_size: f64,
    pub skipped_version: String,
    pub stt_language: String,
    pub stt_translate: bool,
    pub screen_share_visible: bool,
    pub teleprompter_speed: f64,
    pub teleprompter_font_size: f64,
    pub teleprompter_resume: bool,
    pub audio_permission_requested: bool,
    pub screen_permission_requested: bool,
    pub window_width: f64,
    pub window_height: f64,
    pub resize_step: u32,
    pub capture_device_uid: String,
    pub theme: String,
    pub scroll_step: u32,
    pub buffer_enabled: bool,
    pub buffer_seconds: u32,
    pub auto_mode_enabled: bool,
    pub auto_reply_instant: bool,
    pub auto_mic_device_uid: String,
    pub auto_silence_ms: u32,
    pub auto_min_utterance_ms: u32,
    pub auto_max_utterance_secs: u32,
    pub mic_permission_requested: bool,
    pub quick_actions: Vec<QuickAction>,
    pub quick_action_attachments: bool,
    pub onboarding_done: bool,
    pub copy_results_to_clipboard: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            anthropic_api_key: String::new(),
            groq_api_key: String::new(),
            access_token: String::new(),
            prompt_presets: Vec::new(),
            hotkeys: Vec::new(),
            auto_send: false,
            window_opacity: limits::window::OPACITY.default,
            move_step: limits::window::MOVE_STEP.default,
            auto_preview_html: true,
            chat_font_size: limits::chat::FONT_SIZE.default,
            skipped_version: String::new(),
            stt_language: defaults::STT_LANGUAGE.into(),
            stt_translate: false,
            screen_share_visible: false,
            teleprompter_speed: limits::teleprompter::SPEED.default,
            teleprompter_font_size: limits::teleprompter::FONT_SIZE.default,
            teleprompter_resume: true,
            audio_permission_requested: false,
            screen_permission_requested: false,
            window_width: limits::window::WIDTH.default,
            window_height: limits::window::HEIGHT.default,
            resize_step: limits::window::RESIZE_STEP.default,
            capture_device_uid: String::new(),
            theme: defaults::THEME.into(),
            scroll_step: limits::chat::SCROLL_STEP.default,
            buffer_enabled: true,
            buffer_seconds: limits::capture::BUFFER_SECONDS.default,
            auto_mode_enabled: false,
            auto_reply_instant: false,
            auto_mic_device_uid: String::new(),
            auto_silence_ms: limits::capture::AUTO_SILENCE_MS.default,
            auto_min_utterance_ms: limits::capture::AUTO_MIN_UTTERANCE_MS.default,
            auto_max_utterance_secs: limits::capture::AUTO_MAX_UTTERANCE_SECS.default,
            mic_permission_requested: false,
            quick_actions: seeded_quick_actions(),
            quick_action_attachments: false,
            onboarding_done: false,
            copy_results_to_clipboard: true,
        }
    }
}

/// Both retired values were dark, so an existing install keeps the appearance it
/// had; only a fresh install gets `system`.
fn migrate_legacy_theme(value: &mut serde_json::Value) {
    let Some(theme) = value.get("theme").and_then(serde_json::Value::as_str) else {
        return;
    };
    if theme == LEGACY_THEME_GRAY || theme == LEGACY_THEME_BLACK {
        value["theme"] = serde_json::Value::String(THEME_DARK.into());
    }
}

/// Onboarding exists to obtain API access; anyone who already has it has
/// effectively completed it and must not be sent back through the flow.
fn migrate_onboarding_done(value: &mut serde_json::Value) {
    let Some(object) = value.as_object_mut() else {
        return;
    };
    if object.contains_key("onboarding_done") {
        return;
    }
    let configured = ["anthropic_api_key", "groq_api_key", "access_token"].iter().any(|key| {
        object.get(*key).and_then(serde_json::Value::as_str).is_some_and(|v| !v.is_empty())
    });
    object.insert("onboarding_done".into(), serde_json::Value::Bool(configured));
}

impl Settings {
    pub fn clamp(&mut self) {
        self.window_opacity = limits::window::OPACITY.clamp(self.window_opacity);
        self.window_width = limits::window::WIDTH.clamp(self.window_width);
        self.window_height = limits::window::HEIGHT.clamp(self.window_height);
        self.move_step = limits::window::MOVE_STEP.clamp(self.move_step);
        self.resize_step = limits::window::RESIZE_STEP.clamp(self.resize_step);
        self.chat_font_size = limits::chat::FONT_SIZE.clamp(self.chat_font_size);
        self.scroll_step = limits::chat::SCROLL_STEP.clamp(self.scroll_step);
        self.teleprompter_speed = limits::teleprompter::SPEED.clamp(self.teleprompter_speed);
        self.teleprompter_font_size =
            limits::teleprompter::FONT_SIZE.clamp(self.teleprompter_font_size);
        self.buffer_seconds = limits::capture::BUFFER_SECONDS.clamp(self.buffer_seconds);
        self.auto_silence_ms = limits::capture::AUTO_SILENCE_MS.clamp(self.auto_silence_ms);
        self.auto_min_utterance_ms =
            limits::capture::AUTO_MIN_UTTERANCE_MS.clamp(self.auto_min_utterance_ms);
        self.auto_max_utterance_secs =
            limits::capture::AUTO_MAX_UTTERANCE_SECS.clamp(self.auto_max_utterance_secs);
        if !matches!(self.theme.as_str(), THEME_SYSTEM | THEME_LIGHT | THEME_DARK) {
            self.theme = defaults::THEME.into();
        }
        self.quick_actions.truncate(QUICK_ACTION_LIMIT);
        crate::hotkeys::normalize(&mut self.hotkeys);
    }

    pub fn load(path: &Path) -> std::io::Result<Self> {
        let mut settings = match std::fs::read_to_string(path) {
            Ok(raw) => {
                let mut value: serde_json::Value = serde_json::from_str(&raw)
                    .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
                crate::hotkeys::migrate_legacy_fields(&mut value);
                migrate_legacy_theme(&mut value);
                migrate_onboarding_done(&mut value);
                serde_json::from_value::<Settings>(value)
                    .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Settings::default(),
            Err(e) => return Err(e),
        };
        settings.clamp();
        Ok(settings)
    }

    pub fn apply_key_fallback(&mut self, anthropic: Option<String>, groq: Option<String>) {
        if !self.access_token.is_empty() {
            return;
        }
        fn fill_if_empty(target: &mut String, candidate: Option<String>) {
            if !target.is_empty() {
                return;
            }
            if let Some(v) = candidate {
                let v = v.trim();
                if !v.is_empty() {
                    *target = v.to_string();
                }
            }
        }
        fill_if_empty(&mut self.anthropic_api_key, anthropic);
        fill_if_empty(&mut self.groq_api_key, groq);
    }

    pub fn save(&self, path: &Path) -> std::io::Result<()> {
        let json = serde_json::to_string_pretty(self)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
        write_atomic_owner_only(path, &json)
    }
}

fn create_owner_only(path: &Path) -> std::io::Result<std::fs::File> {
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(OWNER_ONLY_FILE_MODE);
    }
    options.open(path)
}

pub(crate) fn write_atomic_owner_only(path: &Path, contents: &str) -> std::io::Result<()> {
    write_atomic_owner_only_bytes(path, contents.as_bytes())
}

fn unique_tmp_path(path: &Path) -> PathBuf {
    let sequence = TMP_FILE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    let mut name = path.file_name().unwrap_or_default().to_os_string();
    name.push(format!(".{}-{sequence}.{TMP_FILE_EXTENSION}", std::process::id()));
    path.with_file_name(name)
}

fn write_tmp_file(tmp: &Path, contents: &[u8]) -> std::io::Result<()> {
    use std::io::Write;
    let mut file = create_owner_only(tmp)?;
    file.write_all(contents)
}

pub(crate) fn write_atomic_owner_only_bytes(path: &Path, contents: &[u8]) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let tmp = unique_tmp_path(path);
    let outcome = write_tmp_file(&tmp, contents).and_then(|()| std::fs::rename(&tmp, path));
    if outcome.is_err() {
        let _ = std::fs::remove_file(&tmp);
    }
    outcome
}

#[cfg(test)]
mod tests;
