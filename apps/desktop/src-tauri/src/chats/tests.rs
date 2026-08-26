use super::*;

#[cfg(unix)]
fn assert_owner_only(path: &std::path::Path) {
    use std::os::unix::fs::PermissionsExt;
    let mode = std::fs::metadata(path).unwrap().permissions().mode();
    assert_eq!(mode & 0o777, 0o600);
}

#[cfg(not(unix))]
fn assert_owner_only(_path: &std::path::Path) {}

fn json_eq(left: &str, right: &str) {
    let l: serde_json::Value = serde_json::from_str(left).unwrap();
    let r: serde_json::Value = serde_json::from_str(right).unwrap();
    assert_eq!(l, r);
}

#[test]
fn save_load_roundtrip_with_owner_only_perms() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("chats.json");
    let payload = r#"[{"id":"a","title":"Чат 1","messages":[],"draft":""}]"#;
    save(&path, payload).unwrap();
    assert_owner_only(&path);
    json_eq(&load(&path).unwrap().unwrap(), payload);
    assert!(!path.with_extension("tmp").exists());
}

#[test]
fn load_missing_file_is_none_not_empty() {
    let missing = std::env::temp_dir().join("harpyhare-nonexistent/chats.json");
    assert_eq!(load(&missing).unwrap(), None);
}

#[test]
fn save_creates_parent_directories() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("nested/deeper/chats.json");
    save(&path, "[]").unwrap();
    assert!(path.exists());
}

#[test]
fn save_writes_the_version_envelope() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("chats.json");
    save(&path, r#"[{"id":"a"}]"#).unwrap();
    let raw: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
    assert_eq!(raw[VERSION_KEY], CURRENT_DOCUMENT_VERSION);
    assert_eq!(raw[PAYLOAD_KEY][0]["id"], "a");
}

#[test]
fn load_reads_the_legacy_bare_array() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("chats.json");
    let legacy = r#"[{"id":"a","messages":[]}]"#;
    std::fs::write(&path, legacy).unwrap();
    json_eq(&load(&path).unwrap().unwrap(), legacy);
}

#[test]
fn load_reads_the_legacy_bare_object() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("context-library.json");
    let legacy = r#"{"docs":[{"id":"d"}],"folders":[]}"#;
    std::fs::write(&path, legacy).unwrap();
    json_eq(&load(&path).unwrap().unwrap(), legacy);
}

/// An object that merely happens to carry a `version` key but no `payload` is
/// still a bare document: unwrapping it would hand the frontend a fragment.
#[test]
fn load_does_not_mistake_a_versioned_payloadless_object_for_an_envelope() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("context-library.json");
    let legacy = r#"{"version":3,"docs":[]}"#;
    std::fs::write(&path, legacy).unwrap();
    json_eq(&load(&path).unwrap().unwrap(), legacy);
}

#[test]
fn load_reports_broken_json_instead_of_pretending_the_file_is_empty() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("chats.json");
    std::fs::write(&path, "{ not json").unwrap();
    assert!(matches!(load(&path), Err(StoreError::Corrupt(..))));
}

#[test]
fn a_legacy_document_survives_one_save_as_a_backup() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("chats.json");
    let legacy = r#"[{"id":"a"}]"#;
    std::fs::write(&path, legacy).unwrap();
    save(&path, r#"[{"id":"b"}]"#).unwrap();
    assert_eq!(std::fs::read_to_string(backup_path(&path)).unwrap(), legacy);
    assert_eq!(load(&path).unwrap().unwrap(), r#"[{"id":"b"}]"#);
}

#[test]
fn a_blank_document_never_overwrites_an_existing_file() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("chats.json");
    save(&path, r#"[{"id":"a"}]"#).unwrap();
    assert!(matches!(save(&path, ""), Err(StoreError::Write(..))));
    assert!(matches!(save(&path, "null"), Err(StoreError::Write(..))));
    json_eq(&load(&path).unwrap().unwrap(), r#"[{"id":"a"}]"#);
}

/// Emptying the library deliberately is not a failure — only a document with no
/// content at all is refused.
#[test]
fn an_empty_array_is_a_legitimate_document() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("chats.json");
    save(&path, r#"[{"id":"a"}]"#).unwrap();
    save(&path, "[]").unwrap();
    assert_eq!(load(&path).unwrap().unwrap(), "[]");
}

#[test]
fn save_refuses_a_document_that_is_not_json() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("chats.json");
    assert!(matches!(save(&path, "не json"), Err(StoreError::Corrupt(..))));
    assert!(!path.exists());
}
