use std::path::Path;

/// Возвращает сохранённую JSON-строку чатов (схему владеет фронт).
/// Отсутствие файла или ошибка чтения → пустая строка (фронт стартует с одним чатом).
pub fn load(path: &Path) -> String {
    std::fs::read_to_string(path).unwrap_or_default()
}

/// Атомарно записывает непрозрачную JSON-строку с правами 0600 (по образцу settings.rs).
pub fn save(path: &Path, json: &str) -> std::io::Result<()> {
    use std::io::Write;
    use std::os::unix::fs::OpenOptionsExt;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;

    #[test]
    fn save_load_roundtrip_with_600_perms() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("chats.json");
        let payload = r#"[{"id":"a","title":"Чат 1","messages":[],"draft":""}]"#;
        save(&path, payload).unwrap();
        let mode = std::fs::metadata(&path).unwrap().permissions().mode();
        assert_eq!(mode & 0o777, 0o600);
        assert_eq!(load(&path), payload);
        assert!(!path.with_extension("tmp").exists()); // tmp убран rename'ом
    }

    #[test]
    fn load_missing_file_gives_empty_string() {
        assert_eq!(load(std::path::Path::new("/nonexistent/chats.json")), "");
    }

    #[test]
    fn save_creates_parent_directories() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("nested/deeper/chats.json");
        save(&path, "[]").unwrap();
        assert!(path.exists());
    }
}
