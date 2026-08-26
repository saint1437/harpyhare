use super::*;

fn dir() -> tempfile::TempDir {
    tempfile::tempdir().unwrap()
}

fn filled() -> Secrets {
    Secrets {
        anthropic_api_key: "sk-ant-api03-secret-value-9f2a".into(),
        groq_api_key: "gsk_secret_value_abcd".into(),
        access_token: "itk_paid_token_value".into(),
        ..Default::default()
    }
}

// ---------- masking ----------

#[test]
fn a_mask_shows_a_recognisable_head_and_a_four_character_tail() {
    assert_eq!(mask_secret("sk-ant-api03-secret-value-9f2a"), "sk-…9f2a");
    assert_eq!(mask_secret("gsk_secret_value_abcd"), "gsk…abcd");
}

#[test]
fn a_short_value_reveals_nothing_but_the_ellipsis() {
    assert_eq!(mask_secret("sk-short"), "…");
    assert_eq!(mask_secret("0123456789"), "…", "десять символов ещё не раскрываются");
}

#[test]
fn an_empty_value_has_no_hint_at_all() {
    assert_eq!(mask_secret(""), "");
    assert_eq!(mask_secret("   "), "");
}

/// The mask slices by characters, not bytes: a multi-byte value would panic on a
/// byte slice, and the file is hand-editable.
#[test]
fn a_multibyte_value_does_not_panic() {
    assert_eq!(mask_secret("ключ-очень-длинный-значение"), "клю…ение");
}

/// `Debug` output reaches stderr and panic messages; a secret printed there is a
/// secret in the user's terminal and in every log that catches stderr.
#[test]
fn the_debug_output_carries_no_secret() {
    let secrets = filled();
    let printed = format!("{secrets:?}");
    for raw in [&secrets.anthropic_api_key, &secrets.groq_api_key, &secrets.access_token] {
        assert!(!printed.contains(raw.as_str()), "в Debug утёк секрет: {printed}");
    }
    assert!(printed.contains("sk-…9f2a"), "маска всё же должна быть видна: {printed}");
}

// ---------- the status: what the frontend is allowed to see ----------

#[test]
fn the_status_reports_presence_and_a_mask_and_nothing_else() {
    let status = filled().status();
    assert!(status.anthropic_key_set);
    assert!(status.groq_key_set);
    assert!(status.access_code_active);
    assert_eq!(status.anthropic_key_hint, "sk-…9f2a");
    assert_eq!(status.groq_key_hint, "gsk…abcd");
}

#[test]
fn a_blank_key_counts_as_unset() {
    let s = Secrets { anthropic_api_key: "   ".into(), ..Default::default() };
    let status = s.status();
    assert!(!status.anthropic_key_set);
    assert_eq!(status.anthropic_key_hint, "");
    assert!(!status.access_code_active);
}

/// The whole point of the split: whatever `get_secrets_status` serialises, none
/// of the three values may appear in it.
#[test]
fn the_serialised_status_contains_no_sample_of_any_secret() {
    let secrets = filled();
    let json = serde_json::to_string(&secrets.status()).unwrap();
    for raw in [&secrets.anthropic_api_key, &secrets.groq_api_key, &secrets.access_token] {
        assert!(!json.contains(raw.as_str()), "секрет уехал бы во фронт: {json}");
    }
    assert!(json.contains("anthropic_key_set"));
}

// ---------- writes ----------

#[test]
fn an_empty_value_does_not_overwrite_a_stored_key() {
    let mut s = filled();
    s.set_key(ApiKeyKind::Anthropic, "");
    s.set_key(ApiKeyKind::Groq, "   ");
    assert_eq!(s.anthropic_api_key, filled().anthropic_api_key);
    assert_eq!(s.groq_api_key, filled().groq_api_key);
}

#[test]
fn a_new_value_replaces_the_stored_one_trimmed() {
    let mut s = filled();
    s.set_key(ApiKeyKind::Anthropic, "  sk-ant-new  ");
    assert_eq!(s.anthropic_api_key, "sk-ant-new");
}

#[test]
fn clearing_erases_only_the_named_key() {
    let mut s = filled();
    s.clear_key(ApiKeyKind::Groq);
    assert_eq!(s.groq_api_key, "");
    assert_eq!(s.anthropic_api_key, filled().anthropic_api_key);
    assert_eq!(s.access_token, filled().access_token);
}

#[test]
fn clearing_the_access_token_leaves_the_keys_alone() {
    let mut s = filled();
    s.clear_access_token();
    assert!(!s.has_access_token());
    assert_eq!(s.anthropic_api_key, filled().anthropic_api_key);
}

#[test]
fn key_reads_back_what_was_written_for_both_kinds() {
    let s = filled();
    assert_eq!(s.key(ApiKeyKind::Anthropic), s.anthropic_api_key);
    assert_eq!(s.key(ApiKeyKind::Groq), s.groq_api_key);
}

// ---------- the env fallback ----------

#[test]
fn env_fallback_fills_only_empty_keys() {
    let mut s = Secrets::default();
    s.apply_key_fallback(Some("env-ant".into()), Some("env-groq".into()));
    assert_eq!(s.anthropic_api_key, "env-ant");
    assert_eq!(s.groq_api_key, "env-groq");
}

#[test]
fn env_fallback_does_not_override_saved_keys() {
    let mut s = Secrets { anthropic_api_key: "saved".into(), ..Default::default() };
    s.apply_key_fallback(Some("env-ant".into()), Some("env-groq".into()));
    assert_eq!(s.anthropic_api_key, "saved");
    assert_eq!(s.groq_api_key, "env-groq");
}

#[test]
fn env_fallback_skipped_entirely_when_the_access_token_is_set() {
    let mut s = Secrets { access_token: "itk_x".into(), ..Default::default() };
    s.apply_key_fallback(Some("env-ant".into()), Some("env-groq".into()));
    assert_eq!(s.anthropic_api_key, "");
    assert_eq!(s.groq_api_key, "");
}

#[test]
fn env_fallback_ignores_none_and_blank() {
    let mut s = Secrets::default();
    s.apply_key_fallback(None, Some("   ".into()));
    assert_eq!(s.anthropic_api_key, "");
    assert_eq!(s.groq_api_key, "");
}

// ---------- the file ----------

#[test]
fn save_load_roundtrip_with_owner_only_perms() {
    let dir = dir();
    let path = dir.path().join(SECRETS_FILE_NAME);
    filled().save(&path).unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mode = std::fs::metadata(&path).unwrap().permissions().mode();
        assert_eq!(mode & 0o777, 0o600, "секреты обязаны лежать под теми же правами");
    }
    let raw = std::fs::read_to_string(&path).unwrap();
    assert_eq!(Secrets::parse(&raw).unwrap(), filled());
}

#[test]
fn a_missing_secrets_file_and_a_missing_settings_file_give_defaults() {
    let dir = dir();
    let load = load_or_migrate(&dir.path().join("secrets.json"), &dir.path().join("s.json"));
    assert_eq!(load.secrets, Secrets::default());
    assert!(!load.needs_write);
    assert!(!load.settings_needs_rewrite);
    assert!(load.recovery.is_none());
}

// ---------- the migration out of settings.json ----------

/// The update must not log anyone out: an old `settings.json` carried all three
/// values inside `Settings`, and they have to come across intact.
#[test]
fn the_secrets_are_lifted_out_of_a_legacy_settings_file() {
    let dir = dir();
    let settings_path = dir.path().join("settings.json");
    let secrets_path = dir.path().join("secrets.json");
    std::fs::write(
        &settings_path,
        r#"{"schema_version":1,"anthropic_api_key":"sk-ant-old","groq_api_key":"gsk_old","access_token":"itk_paid","auto_send":true}"#,
    )
    .unwrap();

    let load = load_or_migrate(&secrets_path, &settings_path);
    assert_eq!(load.secrets.anthropic_api_key, "sk-ant-old");
    assert_eq!(load.secrets.groq_api_key, "gsk_old");
    assert_eq!(load.secrets.access_token, "itk_paid");
    assert!(load.needs_write, "secrets.json ещё не существует — его надо записать");
    assert!(load.settings_needs_rewrite, "settings.json обязан лишиться этих полей");
    assert!(load.recovery.is_none());
}

/// A v0 file — written before `schema_version` existed — is the same case.
#[test]
fn a_pre_versioning_settings_file_is_migrated_too() {
    let dir = dir();
    let settings_path = dir.path().join("settings.json");
    std::fs::write(&settings_path, r#"{"groq_api_key":"gsk_ancient"}"#).unwrap();
    let load = load_or_migrate(&dir.path().join("secrets.json"), &settings_path);
    assert_eq!(load.secrets.groq_api_key, "gsk_ancient");
    assert!(load.needs_write);
}

/// An existing `secrets.json` is the source of truth; stale fields left in
/// `settings.json` must not resurrect an unlinked code.
#[test]
fn an_existing_secrets_file_wins_over_leftovers_in_settings() {
    let dir = dir();
    let settings_path = dir.path().join("settings.json");
    let secrets_path = dir.path().join("secrets.json");
    std::fs::write(&settings_path, r#"{"access_token":"itk_stale"}"#).unwrap();
    Secrets { access_token: "itk_current".into(), ..Default::default() }
        .save(&secrets_path)
        .unwrap();

    let load = load_or_migrate(&secrets_path, &settings_path);
    assert_eq!(load.secrets.access_token, "itk_current");
    assert!(!load.needs_write, "перезаписывать актуальный файл нечем");
    assert!(load.settings_needs_rewrite, "но чистить settings.json всё равно надо");
}

#[test]
fn a_settings_file_without_the_fields_asks_for_no_rewrite() {
    let dir = dir();
    let settings_path = dir.path().join("settings.json");
    std::fs::write(&settings_path, r#"{"schema_version":2,"auto_send":true}"#).unwrap();
    let load = load_or_migrate(&dir.path().join("secrets.json"), &settings_path);
    assert!(!load.needs_write);
    assert!(!load.settings_needs_rewrite);
}

/// Empty legacy fields are nothing to carry over, but they are still plaintext
/// slots that must go — the rewrite happens once and the file converges.
#[test]
fn empty_legacy_fields_are_scrubbed_without_being_migrated() {
    let dir = dir();
    let settings_path = dir.path().join("settings.json");
    std::fs::write(&settings_path, r#"{"anthropic_api_key":"","access_token":""}"#).unwrap();
    let load = load_or_migrate(&dir.path().join("secrets.json"), &settings_path);
    assert!(!load.needs_write);
    assert!(load.settings_needs_rewrite);
}

/// Same policy as `settings::load_or_recover`: the bytes survive under a new
/// name, the user is told, and the legacy file is still consulted.
#[test]
fn a_corrupt_secrets_file_is_renamed_aside_and_reported() {
    let dir = dir();
    let settings_path = dir.path().join("settings.json");
    let secrets_path = dir.path().join("secrets.json");
    let broken = r#"{"access_token": "itk_paid", "#;
    std::fs::write(&secrets_path, broken).unwrap();
    std::fs::write(&settings_path, r#"{"groq_api_key":"gsk_legacy"}"#).unwrap();

    let load = load_or_migrate(&secrets_path, &settings_path);
    let recovery = load.recovery.expect("факт порчи обязан дойти до фронта");
    assert!(!secrets_path.exists(), "битый файл убран с дороги");
    assert_eq!(std::fs::read_to_string(&recovery.backup_path).unwrap(), broken);
    assert_eq!(load.secrets.groq_api_key, "gsk_legacy", "старый файл всё ещё спасают");
}

// ---------- the store ----------

fn store(dir: &tempfile::TempDir) -> SecretsStore {
    SecretsStore::new(dir.path().join(SECRETS_FILE_NAME), Secrets::default())
}

#[test]
fn update_persists_and_returns_both_halves() {
    let dir = dir();
    let store = store(&dir);
    let applied = store.update(|s| s.set_key(ApiKeyKind::Groq, "gsk_typed_value")).unwrap();
    assert_eq!(applied.old.groq_api_key, "");
    assert_eq!(applied.new.groq_api_key, "gsk_typed_value");
    assert_eq!(store.get().groq_api_key, "gsk_typed_value");
    let raw = std::fs::read_to_string(store.path()).unwrap();
    assert_eq!(Secrets::parse(&raw).unwrap().groq_api_key, "gsk_typed_value");
    assert!(store.status().groq_key_set);
}

#[test]
fn an_update_that_changes_nothing_writes_nothing() {
    let dir = dir();
    let store = store(&dir);
    store.update(|s| s.set_key(ApiKeyKind::Anthropic, "")).unwrap();
    assert!(!store.path().exists(), "пустое значение не трогает диск");
}

/// The same race `SettingsService` was built for: a redeem writing the token
/// while the settings screen saves a key. Both must survive.
#[test]
fn two_concurrent_writes_of_two_fields_both_survive() {
    let dir = dir();
    let store = std::sync::Arc::new(store(&dir));
    let barrier = std::sync::Arc::new(std::sync::Barrier::new(2));
    let threads: Vec<_> = [0, 1]
        .into_iter()
        .map(|which| {
            let store = std::sync::Arc::clone(&store);
            let barrier = std::sync::Arc::clone(&barrier);
            std::thread::spawn(move || {
                barrier.wait();
                for _ in 0..50 {
                    if which == 0 {
                        store.update(|s| s.access_token = "itk_paid".into()).unwrap();
                    } else {
                        store.update(|s| s.set_key(ApiKeyKind::Groq, "gsk_typed")).unwrap();
                    }
                }
            })
        })
        .collect();
    for t in threads {
        t.join().unwrap();
    }
    let live = store.get();
    assert_eq!(live.access_token, "itk_paid");
    assert_eq!(live.groq_api_key, "gsk_typed");
    let on_disk = Secrets::parse(&std::fs::read_to_string(store.path()).unwrap()).unwrap();
    assert_eq!(on_disk.access_token, "itk_paid");
    assert_eq!(on_disk.groq_api_key, "gsk_typed");
}
