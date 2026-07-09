use serde::{Deserialize, Serialize};
use std::path::Path;

const DEFAULT_HOTKEY: &str = "F9";
const DEFAULT_TOGGLE_HOTKEY: &str = "Cmd+Shift+H";
const DEFAULT_TELEPROMPTER_HOTKEY: &str = "F10";
const DEFAULT_WINDOW_OPACITY: f64 = 0.9;
const DEFAULT_MOVE_STEP: u32 = 20;
const DEFAULT_CHAT_FONT_SIZE: f64 = 13.5;
const DEFAULT_STT_LANGUAGE: &str = "ru";
const DEFAULT_TELEPROMPTER_SPEED: f64 = 40.0;
const DEFAULT_TELEPROMPTER_FONT_SIZE: f64 = 28.0;

const WINDOW_OPACITY_MIN: f64 = 0.2;
const WINDOW_OPACITY_MAX: f64 = 1.0;
const MOVE_STEP_MIN: u32 = 1;
const MOVE_STEP_MAX: u32 = 200;
const CHAT_FONT_SIZE_MIN: f64 = 10.0;
const CHAT_FONT_SIZE_MAX: f64 = 20.0;
const TELEPROMPTER_SPEED_MIN: f64 = 10.0;
const TELEPROMPTER_SPEED_MAX: f64 = 150.0;
const TELEPROMPTER_FONT_SIZE_MIN: f64 = 20.0;
const TELEPROMPTER_FONT_SIZE_MAX: f64 = 48.0;

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
    pub fast_mode: bool,
    pub chat_font_size: f64,
    pub skipped_version: String,
    pub stt_language: String,
    pub stt_translate: bool,
    pub screen_share_visible: bool,
    pub teleprompter_speed: f64,
    pub teleprompter_font_size: f64,
    pub teleprompter_hotkey: String,
    pub teleprompter_resume: bool,
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
            fast_mode: false,
            chat_font_size: DEFAULT_CHAT_FONT_SIZE,
            skipped_version: String::new(),
            stt_language: DEFAULT_STT_LANGUAGE.into(),
            stt_translate: false,
            screen_share_visible: false,
            teleprompter_speed: DEFAULT_TELEPROMPTER_SPEED,
            teleprompter_font_size: DEFAULT_TELEPROMPTER_FONT_SIZE,
            teleprompter_hotkey: DEFAULT_TELEPROMPTER_HOTKEY.into(),
            teleprompter_resume: true,
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
mod tests {
    use super::*;

    #[test]
    fn defaults_match_spec() {
        let s = Settings::default();
        assert_eq!(s.hotkey, "F9");
        assert!(!s.auto_send);
        assert_eq!(s.window_opacity, 0.9);
        assert_eq!(s.move_step, 20);
        assert!(s.prompt_presets.is_empty());
        assert!(s.auto_preview_html);
        assert_eq!(s.toggle_hotkey, "Cmd+Shift+H");
        assert!(!s.fast_mode);
        assert_eq!(s.chat_font_size, 13.5);
        assert_eq!(s.stt_language, "ru");
        assert!(!s.stt_translate);
        assert!(!s.screen_share_visible);
        assert_eq!(s.teleprompter_speed, 40.0);
        assert_eq!(s.teleprompter_font_size, 28.0);
        assert_eq!(s.teleprompter_hotkey, "F10");
        assert!(s.teleprompter_resume);
    }

    #[test]
    fn clamp_limits_teleprompter_speed_and_font() {
        let mut s = Settings::default();
        s.teleprompter_speed = 5.0;
        s.teleprompter_font_size = 4.0;
        s.clamp();
        assert_eq!(s.teleprompter_speed, 10.0);
        assert_eq!(s.teleprompter_font_size, 20.0);
        s.teleprompter_speed = 999.0;
        s.teleprompter_font_size = 999.0;
        s.clamp();
        assert_eq!(s.teleprompter_speed, 150.0);
        assert_eq!(s.teleprompter_font_size, 48.0);
        s.teleprompter_speed = f64::NAN;
        s.clamp();
        assert_eq!(s.teleprompter_speed, 40.0);
    }

    #[test]
    fn load_missing_teleprompter_fields_default() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("s.json");
        std::fs::write(&path, r#"{"auto_send":true}"#).unwrap();
        let s = Settings::load(&path).unwrap();
        assert_eq!(s.teleprompter_speed, 40.0);
        assert_eq!(s.teleprompter_font_size, 28.0);
    }

    #[test]
    fn clamp_limits_chat_font_size() {
        let mut s = Settings::default();
        s.chat_font_size = 5.0;
        s.clamp();
        assert_eq!(s.chat_font_size, 10.0);
        s.chat_font_size = 99.0;
        s.clamp();
        assert_eq!(s.chat_font_size, 20.0);
        s.chat_font_size = f64::NAN;
        s.clamp();
        assert_eq!(s.chat_font_size, 13.5);
    }

    #[test]
    fn load_old_model_field_is_ignored() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("s.json");
        std::fs::write(&path, r#"{"model":"claude-haiku-4-5","auto_send":true}"#).unwrap();
        let s = Settings::load(&path).unwrap();
        assert!(s.auto_send);
    }

    #[test]
    fn load_missing_skipped_version_defaults_empty() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("s.json");
        std::fs::write(&path, r#"{"auto_send":true}"#).unwrap();
        let s = Settings::load(&path).unwrap();
        assert_eq!(s.skipped_version, "");
    }

    #[test]
    fn load_missing_stt_and_screen_share_fields_default() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("s.json");
        std::fs::write(&path, r#"{"auto_send":true}"#).unwrap();
        let s = Settings::load(&path).unwrap();
        assert_eq!(s.stt_language, "ru");
        assert!(!s.stt_translate);
        assert!(!s.screen_share_visible);
    }

    #[test]
    fn load_missing_fast_mode_defaults_false() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("s.json");
        std::fs::write(&path, r#"{"auto_send":true}"#).unwrap();
        let s = Settings::load(&path).unwrap();
        assert!(!s.fast_mode);
    }

    #[test]
    fn env_fallback_fills_only_empty_keys() {
        let mut s = Settings::default();
        s.apply_key_fallback(Some("env-ant".into()), Some("env-groq".into()));
        assert_eq!(s.anthropic_api_key, "env-ant");
        assert_eq!(s.groq_api_key, "env-groq");
    }

    #[test]
    fn env_fallback_skipped_entirely_when_access_token_set() {
        let mut s = Settings::default();
        s.access_token = "itk_x".into();
        s.apply_key_fallback(Some("env-ant".into()), Some("env-groq".into()));
        assert_eq!(s.anthropic_api_key, "");
        assert_eq!(s.groq_api_key, "");
    }

    #[test]
    fn load_missing_access_token_defaults_empty() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("s.json");
        std::fs::write(&path, r#"{"auto_send":true}"#).unwrap();
        let s = Settings::load(&path).unwrap();
        assert_eq!(s.access_token, "");
    }

    #[test]
    fn env_fallback_does_not_override_saved_keys() {
        let mut s = Settings::default();
        s.anthropic_api_key = "saved".into();
        s.apply_key_fallback(Some("env-ant".into()), Some("env-groq".into()));
        assert_eq!(s.anthropic_api_key, "saved");
        assert_eq!(s.groq_api_key, "env-groq");
    }

    #[test]
    fn env_fallback_ignores_none_and_blank() {
        let mut s = Settings::default();
        s.apply_key_fallback(None, Some("   ".into()));
        assert_eq!(s.anthropic_api_key, "");
        assert_eq!(s.groq_api_key, "");
    }

    #[test]
    fn clamp_limits_opacity_and_step() {
        let mut s = Settings::default();
        s.window_opacity = 0.05;
        s.move_step = 1000;
        s.clamp();
        assert_eq!(s.window_opacity, 0.2);
        assert_eq!(s.move_step, 200);
        s.window_opacity = 1.5;
        s.move_step = 0;
        s.clamp();
        assert_eq!(s.window_opacity, 1.0);
        assert_eq!(s.move_step, 1);
    }

    #[test]
    fn save_load_roundtrip_with_600_perms() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        let mut s = Settings::default();
        s.groq_api_key = "gsk_test".into();
        s.chat_font_size = 15.0;
        s.window_opacity = 0.5;
        s.auto_send = true;
        s.auto_preview_html = false;
        s.toggle_hotkey = "F10".into();
        s.prompt_presets = vec![test_preset()];
        s.save(&path).unwrap();
        let mode = std::fs::metadata(&path).unwrap().permissions().mode();
        assert_eq!(mode & 0o777, 0o600);
        let loaded = Settings::load(&path).unwrap();
        assert_eq!(loaded.groq_api_key, "gsk_test");
        assert_eq!(loaded.chat_font_size, 15.0);
        assert_eq!(loaded.window_opacity, 0.5);
        assert!(loaded.auto_send);
        assert!(!loaded.auto_preview_html);
        assert_eq!(loaded.toggle_hotkey, "F10");
        assert_eq!(loaded.prompt_presets.len(), 1);
        assert_eq!(loaded.prompt_presets[0].name, "Тест");
    }

    #[test]
    fn load_missing_auto_preview_html_defaults_true() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("s.json");
        std::fs::write(&path, r#"{"auto_send":true}"#).unwrap();
        let s = Settings::load(&path).unwrap();
        assert!(s.auto_preview_html);
    }

    #[test]
    fn load_missing_toggle_hotkey_defaults() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("s.json");
        std::fs::write(&path, r#"{"auto_send":true}"#).unwrap();
        let s = Settings::load(&path).unwrap();
        assert_eq!(s.toggle_hotkey, "Cmd+Shift+H");
    }

    #[test]
    fn load_missing_file_gives_defaults() {
        let s = Settings::load(std::path::Path::new("/nonexistent/x.json")).unwrap();
        assert_eq!(s.hotkey, "F9");
        assert!(!s.auto_send);
        assert_eq!(s.move_step, 20);
    }

    #[test]
    fn load_clamps_out_of_range_values() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("s.json");
        std::fs::write(&path, r#"{"window_opacity":0.05,"move_step":999}"#).unwrap();
        let s = Settings::load(&path).unwrap();
        assert_eq!(s.window_opacity, 0.2);
        assert_eq!(s.move_step, 200);
    }

    #[test]
    fn save_creates_parent_directories() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("nested/deeper/settings.json");
        Settings::default().save(&path).unwrap();
        assert!(path.exists());
        assert!(!path.with_extension("tmp").exists());
    }

    fn test_preset() -> PromptPreset {
        PromptPreset { id: "p1".into(), name: "Тест".into(), text: "текст".into() }
    }

    #[test]
    fn load_missing_prompt_presets_defaults_to_empty() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("s.json");
        std::fs::write(&path, r#"{"auto_send":true}"#).unwrap();
        let s = Settings::load(&path).unwrap();
        assert!(s.prompt_presets.is_empty());
    }

    #[test]
    fn load_old_system_prompt_is_ignored() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("s.json");
        std::fs::write(&path, r#"{"system_prompt":"старое","auto_send":false}"#).unwrap();
        let s = Settings::load(&path).unwrap();
        assert!(s.prompt_presets.is_empty());
    }
}
