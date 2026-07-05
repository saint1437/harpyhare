use serde::{Deserialize, Serialize};
use std::path::Path;

pub const DEFAULT_SYSTEM_PROMPT: &str = "Ты получаешь расшифровку русской речи из аудио (могут быть ошибки распознавания). Ответь на вопрос или прокомментируй сказанное кратко и по делу, на русском.";

#[derive(Debug, Clone, Serialize, Deserialize)]
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
    pub prompt_presets: Vec<PromptPreset>,
    pub hotkey: String,
    pub auto_send: bool,
    pub window_opacity: f64,
    pub move_step: u32,
    pub auto_preview_html: bool,
    pub toggle_hotkey: String,
    /// Anthropic fast mode (research preview): до ~2.5x токенов/сек на opus-4-8, дороже.
    pub fast_mode: bool,
    /// Размер шрифта чата, px (модель теперь свойство чата, а не настроек).
    pub chat_font_size: f64,
    /// Версия, «пропущенная» в диалоге обновления: автоуведомление о ней
    /// не показывается ("" — ничего не пропущено). Ручную проверку не глушит.
    pub skipped_version: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            anthropic_api_key: String::new(),
            groq_api_key: String::new(),
            prompt_presets: vec![PromptPreset {
                id: "transcription".into(),
                name: "Расшифровка речи".into(),
                text: DEFAULT_SYSTEM_PROMPT.into(),
            }],
            hotkey: "F9".into(),
            auto_send: false,
            window_opacity: 0.9,
            move_step: 20,
            auto_preview_html: true,
            toggle_hotkey: "Cmd+Shift+H".into(),
            fast_mode: false,
            chat_font_size: 13.5,
            skipped_version: String::new(),
        }
    }
}

impl Settings {
    pub fn clamp(&mut self) {
        self.window_opacity = self.window_opacity.clamp(0.2, 1.0);
        self.move_step = self.move_step.clamp(1, 200);
        if !self.chat_font_size.is_finite() {
            self.chat_font_size = 13.5;
        }
        self.chat_font_size = self.chat_font_size.clamp(10.0, 20.0);
    }

    pub fn load(path: &Path) -> std::io::Result<Self> {
        match std::fs::read_to_string(path) {
            Ok(raw) => {
                let mut s: Settings = serde_json::from_str(&raw)
                    .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
                s.clamp();
                Ok(s)
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok({
                let mut s = Settings::default();
                s.clamp();
                s
            }),
            Err(e) => Err(e),
        }
    }

    /// Подставляет ключи из окружения (.env), если в сохранённых настройках они пустые.
    /// Сохранённые через UI значения всегда приоритетнее; пустые/пробельные кандидаты игнорируются.
    pub fn apply_key_fallback(&mut self, anthropic: Option<String>, groq: Option<String>) {
        fn fill(target: &mut String, candidate: Option<String>) {
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
        fill(&mut self.anthropic_api_key, anthropic);
        fill(&mut self.groq_api_key, groq);
    }

    pub fn save(&self, path: &Path) -> std::io::Result<()> {
        use std::io::Write;
        use std::os::unix::fs::OpenOptionsExt;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let json = serde_json::to_string_pretty(self)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
        let tmp = path.with_extension("tmp");
        {
            let mut f = std::fs::OpenOptions::new()
                .write(true)
                .create(true)
                .truncate(true)
                .mode(0o600)
                .open(&tmp)?;
            f.write_all(json.as_bytes())?;
        }
        std::fs::rename(&tmp, path)
    }
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
        assert_eq!(s.prompt_presets.len(), 1);
        assert_eq!(s.prompt_presets[0].id, "transcription");
        assert!(s.prompt_presets[0].text.contains("расшифровку"));
        assert!(s.auto_preview_html);
        assert_eq!(s.toggle_hotkey, "Cmd+Shift+H");
        assert!(!s.fast_mode);
        assert_eq!(s.chat_font_size, 13.5);
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
        // модель переехала в чат: старый settings.json с полем model просто игнорируется
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
        assert_eq!(s.skipped_version, ""); // старый settings.json без поля → ""
    }

    #[test]
    fn load_missing_fast_mode_defaults_false() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("s.json");
        std::fs::write(&path, r#"{"auto_send":true}"#).unwrap();
        let s = Settings::load(&path).unwrap();
        assert!(!s.fast_mode); // старый settings.json без поля → false
    }

    #[test]
    fn env_fallback_fills_only_empty_keys() {
        let mut s = Settings::default();
        s.apply_key_fallback(Some("env-ant".into()), Some("env-groq".into()));
        assert_eq!(s.anthropic_api_key, "env-ant");
        assert_eq!(s.groq_api_key, "env-groq");
    }

    #[test]
    fn env_fallback_does_not_override_saved_keys() {
        let mut s = Settings::default();
        s.anthropic_api_key = "saved".into();
        s.apply_key_fallback(Some("env-ant".into()), Some("env-groq".into()));
        assert_eq!(s.anthropic_api_key, "saved"); // UI-ключ приоритетнее
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
        assert!(s.auto_preview_html); // старый settings.json без поля → true
    }

    #[test]
    fn load_missing_toggle_hotkey_defaults() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("s.json");
        std::fs::write(&path, r#"{"auto_send":true}"#).unwrap();
        let s = Settings::load(&path).unwrap();
        assert_eq!(s.toggle_hotkey, "Cmd+Shift+H"); // старый json без поля → дефолт
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
        assert!(!path.with_extension("tmp").exists()); // tmp-файл убран rename'ом
    }

    fn test_preset() -> PromptPreset {
        PromptPreset { id: "p1".into(), name: "Тест".into(), text: "текст".into() }
    }

    #[test]
    fn load_missing_prompt_presets_defaults_to_seed() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("s.json");
        std::fs::write(&path, r#"{"auto_send":true}"#).unwrap();
        let s = Settings::load(&path).unwrap();
        assert_eq!(s.prompt_presets.len(), 1);
        assert_eq!(s.prompt_presets[0].id, "transcription");
    }

    #[test]
    fn load_old_system_prompt_is_ignored() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("s.json");
        std::fs::write(&path, r#"{"system_prompt":"старое","auto_send":false}"#).unwrap();
        let s = Settings::load(&path).unwrap();
        assert_eq!(s.prompt_presets[0].id, "transcription");
    }
}
