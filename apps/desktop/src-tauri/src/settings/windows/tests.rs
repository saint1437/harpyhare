use super::*;

/// Runs on Windows only — CI's windows job compiles it through
/// `clippy --all-targets`, and the test binary itself runs on macOS.
#[test]
fn a_real_file_can_be_restricted_and_stays_readable_by_its_owner() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("settings.json");
    std::fs::write(&path, "{}").unwrap();

    restrict_to_current_user(&path).unwrap();
    // Idempotent: every atomic write applies it again to a fresh temp file.
    restrict_to_current_user(&path).unwrap();
    assert_eq!(std::fs::read_to_string(&path).unwrap(), "{}");
}

#[test]
fn a_missing_file_is_a_failure_not_a_silent_success() {
    let dir = tempfile::tempdir().unwrap();
    assert!(restrict_to_current_user(&dir.path().join("нет.json")).is_err());
}
