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
    assert!(!path.with_extension("tmp").exists());
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
