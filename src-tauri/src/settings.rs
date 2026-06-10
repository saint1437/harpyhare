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
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Settings::default()),
            Err(e) => Err(e),
        }
    }

    pub fn save(&self, path: &Path) -> std::io::Result<()> {
        use std::os::unix::fs::PermissionsExt;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(path, serde_json::to_string_pretty(self).unwrap())?;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))
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
        s.save(&path).unwrap();
        let mode = std::fs::metadata(&path).unwrap().permissions().mode();
        assert_eq!(mode & 0o777, 0o600);
        assert_eq!(Settings::load(&path).unwrap().groq_api_key, "gsk_test");
    }

    #[test]
    fn load_missing_file_gives_defaults() {
        let s = Settings::load(std::path::Path::new("/nonexistent/x.json")).unwrap();
        assert_eq!(s.model, "claude-opus-4-8");
    }
}
