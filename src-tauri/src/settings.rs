use serde::{Deserialize, Serialize};
use std::path::Path;

pub const DEFAULT_SYSTEM_PROMPT: &str = "Ты получаешь расшифровку русской речи из аудио (могут быть ошибки распознавания). Ответь на вопрос или прокомментируй сказанное кратко и по делу, на русском.";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    pub anthropic_api_key: String,
    pub groq_api_key: String,
    pub model: String,
    pub system_prompt: String,
    pub hotkey: String,
    pub auto_send: bool,
    pub window_opacity: f64,
    pub move_step: u32,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            anthropic_api_key: String::new(),
            groq_api_key: String::new(),
            model: "claude-opus-4-8".into(),
            system_prompt: DEFAULT_SYSTEM_PROMPT.into(),
            hotkey: "V".into(),
            auto_send: false,
            window_opacity: 1.0,
            move_step: 20,
        }
    }
}

impl Settings {
    pub fn clamp(&mut self) {
        self.window_opacity = self.window_opacity.clamp(0.2, 1.0);
        self.move_step = self.move_step.clamp(1, 200);
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
        assert_eq!(s.model, "claude-opus-4-8");
        assert_eq!(s.hotkey, "V");
        assert!(!s.auto_send);
        assert_eq!(s.window_opacity, 1.0);
        assert_eq!(s.move_step, 20);
        assert!(s.system_prompt.contains("расшифровку"));
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
        s.model = "claude-sonnet-4-6".into();
        s.window_opacity = 0.5;
        s.auto_send = true;
        s.save(&path).unwrap();
        let mode = std::fs::metadata(&path).unwrap().permissions().mode();
        assert_eq!(mode & 0o777, 0o600);
        let loaded = Settings::load(&path).unwrap();
        assert_eq!(loaded.groq_api_key, "gsk_test");
        assert_eq!(loaded.model, "claude-sonnet-4-6");
        assert_eq!(loaded.window_opacity, 0.5);
        assert!(loaded.auto_send);
    }

    #[test]
    fn load_missing_file_gives_defaults() {
        let s = Settings::load(std::path::Path::new("/nonexistent/x.json")).unwrap();
        assert_eq!(s.model, "claude-opus-4-8");
        assert_eq!(s.hotkey, "V");
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
}
