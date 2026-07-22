use serde::{Deserialize, Serialize};
use std::path::Path;

const DEFAULT_HOTKEY: &str = "F9";
const DEFAULT_TOGGLE_HOTKEY: &str = "Cmd+Shift+H";
const DEFAULT_TELEPROMPTER_HOTKEY: &str = "F10";
const DEFAULT_WINDOW_OPACITY: f64 = 0.9;
const DEFAULT_MOVE_STEP: u32 = 20;
const DEFAULT_RESIZE_STEP: u32 = 20;
const DEFAULT_SCROLL_STEP: u32 = 120;
const DEFAULT_CHAT_FONT_SIZE: f64 = 13.5;
const DEFAULT_STT_LANGUAGE: &str = "ru";
const THEME_GRAY: &str = "gray";
const THEME_BLACK: &str = "black";
const DEFAULT_TELEPROMPTER_SPEED: f64 = 40.0;
const DEFAULT_TELEPROMPTER_FONT_SIZE: f64 = 28.0;
const DEFAULT_WINDOW_WIDTH: f64 = 960.0;
const DEFAULT_WINDOW_HEIGHT: f64 = 680.0;
const DEFAULT_BUFFER_SECONDS: u64 = 4;

const WINDOW_OPACITY_MIN: f64 = 0.2;
const WINDOW_OPACITY_MAX: f64 = 1.0;
const MOVE_STEP_MIN: u32 = 1;
const MOVE_STEP_MAX: u32 = 200;
const SCROLL_STEP_MIN: u32 = 10;
const SCROLL_STEP_MAX: u32 = 1000;
const CHAT_FONT_SIZE_MIN: f64 = 10.0;
const CHAT_FONT_SIZE_MAX: f64 = 20.0;
const TELEPROMPTER_SPEED_MIN: f64 = 10.0;
const TELEPROMPTER_SPEED_MAX: f64 = 150.0;
const TELEPROMPTER_FONT_SIZE_MIN: f64 = 20.0;
const TELEPROMPTER_FONT_SIZE_MAX: f64 = 48.0;
const WINDOW_WIDTH_MIN: f64 = 300.0;
const WINDOW_WIDTH_MAX: f64 = 1600.0;
const WINDOW_HEIGHT_MIN: f64 = 520.0;
const WINDOW_HEIGHT_MAX: f64 = 1100.0;
const BUFFER_SECONDS_MIN: u64 = 4;
const BUFFER_SECONDS_MAX: u64 = 10;

const OWNER_ONLY_FILE_MODE: u32 = 0o600;
const TMP_FILE_EXTENSION: &str = "tmp";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PromptPreset {
    pub id: String,
    pub name: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    pub anthropic_api_key: String,
    pub groq_api_key: String,
    pub access_token: String,
    pub prompt_presets: Vec<PromptPreset>,
    pub hotkey: String,
    pub auto_send: bool,
    pub window_opacity: f64,
    pub move_step: u32,
    pub auto_preview_html: bool,
    pub toggle_hotkey: String,
    pub chat_font_size: f64,
    pub skipped_version: String,
    pub stt_language: String,
    pub stt_translate: bool,
    pub screen_share_visible: bool,
    pub teleprompter_speed: f64,
    pub teleprompter_font_size: f64,
    pub teleprompter_hotkey: String,
    pub teleprompter_resume: bool,
    pub window_width: f64,
    pub window_height: f64,
    pub resize_step: u32,
    pub capture_device_uid: String,
    pub theme: String,
    pub scroll_step: u32,
    pub buffer_enabled: bool,
    pub buffer_seconds: u64,
    pub identity_id: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            anthropic_api_key: String::new(),
            groq_api_key: String::new(),
            access_token: String::new(),
            prompt_presets: Vec::new(),
            hotkey: DEFAULT_HOTKEY.into(),
            auto_send: false,
            window_opacity: DEFAULT_WINDOW_OPACITY,
            move_step: DEFAULT_MOVE_STEP,
            auto_preview_html: true,
            toggle_hotkey: DEFAULT_TOGGLE_HOTKEY.into(),
            chat_font_size: DEFAULT_CHAT_FONT_SIZE,
            skipped_version: String::new(),
            stt_language: DEFAULT_STT_LANGUAGE.into(),
            stt_translate: false,
            screen_share_visible: false,
            teleprompter_speed: DEFAULT_TELEPROMPTER_SPEED,
            teleprompter_font_size: DEFAULT_TELEPROMPTER_FONT_SIZE,
            teleprompter_hotkey: DEFAULT_TELEPROMPTER_HOTKEY.into(),
            teleprompter_resume: true,
            window_width: DEFAULT_WINDOW_WIDTH,
            window_height: DEFAULT_WINDOW_HEIGHT,
            resize_step: DEFAULT_RESIZE_STEP,
            capture_device_uid: String::new(),
            theme: THEME_GRAY.into(),
            scroll_step: DEFAULT_SCROLL_STEP,
            buffer_enabled: true,
            buffer_seconds: DEFAULT_BUFFER_SECONDS,
            identity_id: String::new(),
        }
    }
}

impl Settings {
    pub fn clamp(&mut self) {
        self.window_opacity = self.window_opacity.clamp(WINDOW_OPACITY_MIN, WINDOW_OPACITY_MAX);
        self.move_step = self.move_step.clamp(MOVE_STEP_MIN, MOVE_STEP_MAX);
        if !self.chat_font_size.is_finite() {
            self.chat_font_size = DEFAULT_CHAT_FONT_SIZE;
        }
        self.chat_font_size = self.chat_font_size.clamp(CHAT_FONT_SIZE_MIN, CHAT_FONT_SIZE_MAX);
        if !self.teleprompter_speed.is_finite() {
            self.teleprompter_speed = DEFAULT_TELEPROMPTER_SPEED;
        }
        self.teleprompter_speed = self
            .teleprompter_speed
            .clamp(TELEPROMPTER_SPEED_MIN, TELEPROMPTER_SPEED_MAX);
        if !self.teleprompter_font_size.is_finite() {
            self.teleprompter_font_size = DEFAULT_TELEPROMPTER_FONT_SIZE;
        }
        self.teleprompter_font_size = self
            .teleprompter_font_size
            .clamp(TELEPROMPTER_FONT_SIZE_MIN, TELEPROMPTER_FONT_SIZE_MAX);
        if !self.window_width.is_finite() {
            self.window_width = DEFAULT_WINDOW_WIDTH;
        }
        self.window_width = self.window_width.clamp(WINDOW_WIDTH_MIN, WINDOW_WIDTH_MAX);
        if !self.window_height.is_finite() {
            self.window_height = DEFAULT_WINDOW_HEIGHT;
        }
        self.window_height = self.window_height.clamp(WINDOW_HEIGHT_MIN, WINDOW_HEIGHT_MAX);
        self.resize_step = self.resize_step.clamp(MOVE_STEP_MIN, MOVE_STEP_MAX);
        if self.theme != THEME_GRAY && self.theme != THEME_BLACK {
            self.theme = THEME_GRAY.into();
        }
        self.scroll_step = self.scroll_step.clamp(SCROLL_STEP_MIN, SCROLL_STEP_MAX);
        self.buffer_seconds = self.buffer_seconds.clamp(BUFFER_SECONDS_MIN, BUFFER_SECONDS_MAX);
        if !crate::identity::is_known_id(&self.identity_id) {
            self.identity_id = String::new();
        }
    }

    pub fn load(path: &Path) -> std::io::Result<Self> {
        let mut settings = match std::fs::read_to_string(path) {
            Ok(raw) => serde_json::from_str::<Settings>(&raw)
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?,
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

pub(crate) fn write_atomic_owner_only(path: &Path, contents: &str) -> std::io::Result<()> {
    use std::io::Write;
    use std::os::unix::fs::OpenOptionsExt;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension(TMP_FILE_EXTENSION);
    {
        let mut f = std::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(OWNER_ONLY_FILE_MODE)
            .open(&tmp)?;
        f.write_all(contents.as_bytes())?;
    }
    std::fs::rename(&tmp, path)
}

#[cfg(test)]
mod tests;
