use super::*;

#[test]
fn defaults_match_spec() {
    let s = Settings::default();
    assert!(s.hotkeys.is_empty());
    assert!(!s.auto_send);
    assert_eq!(s.window_opacity, 0.9);
    assert_eq!(s.move_step, 20);
    assert!(s.prompt_presets.is_empty());
    assert!(s.auto_preview_html);
    assert_eq!(s.chat_font_size, 13.5);
    assert_eq!(s.stt_language, "ru");
    assert!(!s.stt_translate);
    assert!(!s.screen_share_visible);
    assert_eq!(s.teleprompter_speed, 40.0);
    assert_eq!(s.teleprompter_font_size, 28.0);
    assert!(s.teleprompter_resume);
    assert_eq!(s.window_width, 960.0);
    assert_eq!(s.window_height, 680.0);
    assert_eq!(s.resize_step, 20);
    assert_eq!(s.capture_device_uid, "");
    assert!(s.buffer_enabled);
    assert_eq!(s.buffer_seconds, 4);
}

#[test]
fn load_missing_quick_actions_gives_the_seeds() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("s.json");
    std::fs::write(&path, r#"{"auto_send":true}"#).unwrap();
    let s = Settings::load(&path).unwrap();
    let ids: Vec<&str> = s.quick_actions.iter().map(|a| a.id.as_str()).collect();
    assert_eq!(ids, vec!["detail", "brief", "code"]);
    assert!(!s.quick_action_attachments);
}

#[test]
fn load_saved_empty_quick_actions_stays_empty() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("s.json");
    std::fs::write(&path, r#"{"quick_actions":[]}"#).unwrap();
    let s = Settings::load(&path).unwrap();
    assert!(s.quick_actions.is_empty(), "удалённые пользователем действия не возвращаются сидами");
}

#[test]
fn clamp_limits_quick_actions_to_the_digit_row() {
    let mut s = Settings {
        quick_actions: (0..QUICK_ACTION_LIMIT + 3).map(test_quick_action).collect(),
        ..Default::default()
    };
    s.clamp();
    assert_eq!(s.quick_actions.len(), QUICK_ACTION_LIMIT);
    assert_eq!(s.quick_actions.last().unwrap(), &test_quick_action(QUICK_ACTION_LIMIT - 1));
}

#[test]
fn load_missing_buffer_fields_default() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("s.json");
    std::fs::write(&path, r#"{"auto_send":true}"#).unwrap();
    let s = Settings::load(&path).unwrap();
    assert!(s.buffer_enabled);
    assert_eq!(s.buffer_seconds, 4);
}

#[test]
fn clamp_limits_buffer_seconds() {
    let mut s = Settings { buffer_seconds: 1, ..Default::default() };
    s.clamp();
    assert_eq!(s.buffer_seconds, 4);
    s.buffer_seconds = 120;
    s.clamp();
    assert_eq!(s.buffer_seconds, 10);
}

#[test]
fn clamp_limits_teleprompter_speed_and_font() {
    let mut s =
        Settings { teleprompter_speed: 5.0, teleprompter_font_size: 4.0, ..Default::default() };
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
    let mut s = Settings { chat_font_size: 5.0, ..Default::default() };
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
fn clamp_limits_window_size() {
    let mut s = Settings { window_width: 100.0, window_height: 100.0, ..Default::default() };
    s.clamp();
    assert_eq!(s.window_width, 300.0);
    assert_eq!(s.window_height, 520.0);
    s.window_width = 5000.0;
    s.window_height = 5000.0;
    s.clamp();
    assert_eq!(s.window_width, 1600.0);
    assert_eq!(s.window_height, 1100.0);
    s.window_width = f64::NAN;
    s.window_height = f64::NAN;
    s.clamp();
    assert_eq!(s.window_width, 960.0);
    assert_eq!(s.window_height, 680.0);
}

#[test]
fn load_missing_window_size_defaults() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("s.json");
    std::fs::write(&path, r#"{"auto_send":true}"#).unwrap();
    let s = Settings::load(&path).unwrap();
    assert_eq!(s.window_width, 960.0);
    assert_eq!(s.window_height, 680.0);
    assert_eq!(s.resize_step, 20);
    assert_eq!(s.capture_device_uid, "");
    assert_eq!(s.theme, defaults::THEME);
    assert_eq!(s.scroll_step, 120);
}

#[test]
fn clamp_limits_scroll_step() {
    let mut s = Settings { scroll_step: 1, ..Default::default() };
    s.clamp();
    assert_eq!(s.scroll_step, 10);
    s.scroll_step = 100_000;
    s.clamp();
    assert_eq!(s.scroll_step, 1000);
}

#[test]
fn clamp_limits_resize_step() {
    let mut s = Settings { resize_step: 1000, ..Default::default() };
    s.clamp();
    assert_eq!(s.resize_step, 200);
    s.resize_step = 0;
    s.clamp();
    assert_eq!(s.resize_step, 1);
}

#[test]
fn clamp_resolves_hotkey_collisions_in_favour_of_the_latest_binding() {
    use crate::hotkeys::{HotkeyBinding, ACTION_RECORD, ACTION_TOGGLE_WINDOW};
    let mut s = Settings {
        hotkeys: vec![
            HotkeyBinding { action: ACTION_TOGGLE_WINDOW.into(), combo: "Cmd+Shift+X".into() },
            HotkeyBinding { action: ACTION_RECORD.into(), combo: "Cmd+Shift+X".into() },
        ],
        ..Default::default()
    };
    s.clamp();
    assert_eq!(crate::hotkeys::effective(&s.hotkeys, ACTION_RECORD), "Cmd+Shift+X");
    assert_eq!(crate::hotkeys::effective(&s.hotkeys, ACTION_TOGGLE_WINDOW), "");
}

#[test]
fn clamp_resets_unknown_theme() {
    let mut s = Settings { theme: "neon".into(), ..Default::default() };
    s.clamp();
    assert_eq!(s.theme, defaults::THEME);
    for accepted in [THEME_SYSTEM, THEME_LIGHT, THEME_DARK] {
        s.theme = accepted.into();
        s.clamp();
        assert_eq!(s.theme, accepted);
    }
    // The retired pair must not survive clamping — they are migrated on load,
    // and anything that reaches clamp still holding one is a bug.
    for retired in [LEGACY_THEME_GRAY, LEGACY_THEME_BLACK] {
        s.theme = retired.into();
        s.clamp();
        assert_eq!(s.theme, defaults::THEME);
    }
}

#[test]
fn load_migrates_the_retired_dark_themes() {
    let dir = tempfile::tempdir().unwrap();
    for (retired, path) in [(LEGACY_THEME_GRAY, "gray.json"), (LEGACY_THEME_BLACK, "black.json")] {
        let path = dir.path().join(path);
        std::fs::write(&path, format!(r#"{{"theme":"{retired}"}}"#)).unwrap();
        // Both were dark, so an existing install keeps the appearance it had.
        assert_eq!(Settings::load(&path).unwrap().theme, THEME_DARK);
    }
}

#[test]
fn load_marks_onboarding_done_when_access_already_exists() {
    let dir = tempfile::tempdir().unwrap();
    let configured = dir.path().join("configured.json");
    std::fs::write(&configured, r#"{"groq_api_key":"gsk_test"}"#).unwrap();
    assert!(Settings::load(&configured).unwrap().onboarding_done);

    let empty = dir.path().join("empty.json");
    std::fs::write(&empty, r#"{"auto_send":true}"#).unwrap();
    assert!(!Settings::load(&empty).unwrap().onboarding_done);

    // An explicit value always wins over the inference.
    let explicit = dir.path().join("explicit.json");
    std::fs::write(&explicit, r#"{"groq_api_key":"gsk_test","onboarding_done":false}"#).unwrap();
    assert!(!Settings::load(&explicit).unwrap().onboarding_done);
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

/// The audit's finding, expressed as a test over the very type `get_settings`
/// returns: whatever `Settings` is serialised into, none of the three secrets
/// may appear in it. It walks the JSON looking for sample values planted in the
/// only place they could still come from — a legacy document — because a field
/// re-added under any name would carry them straight back to the webview.
#[test]
fn serialised_settings_carry_no_secret_whatsoever() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("s.json");
    let samples = ["sk-ant-secret-sample", "gsk_secret_sample", "itk_secret_sample"];
    std::fs::write(
        &path,
        format!(
            r#"{{"anthropic_api_key":"{}","groq_api_key":"{}","access_token":"{}"}}"#,
            samples[0], samples[1], samples[2]
        ),
    )
    .unwrap();

    let json = serde_json::to_string(&Settings::load(&path).unwrap()).unwrap();
    for sample in samples {
        assert!(!json.contains(sample), "секрет уехал бы во фронт в get_settings: {json}");
    }
    for field in crate::secrets::LEGACY_SETTINGS_FIELDS {
        assert!(!json.contains(field), "поле {field} снова в Settings: {json}");
    }
}

#[test]
fn clamp_limits_opacity_and_step() {
    let mut s = Settings { window_opacity: 0.05, move_step: 1000, ..Default::default() };
    s.clamp();
    assert_eq!(s.window_opacity, limits::window::OPACITY.min);
    assert_eq!(s.move_step, 200);
    s.window_opacity = 1.5;
    s.move_step = 0;
    s.clamp();
    assert_eq!(s.window_opacity, 1.0);
    assert_eq!(s.move_step, 1);
}

#[test]
fn save_load_roundtrip_with_owner_only_perms() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("settings.json");
    let s = Settings {
        skipped_version: "0.9.9".into(),
        chat_font_size: 15.0,
        window_opacity: 0.8,
        auto_send: true,
        auto_preview_html: false,
        prompt_presets: vec![test_preset()],
        ..Default::default()
    };
    s.save(&path).unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mode = std::fs::metadata(&path).unwrap().permissions().mode();
        assert_eq!(mode & 0o777, 0o600);
    }
    let loaded = Settings::load(&path).unwrap();
    assert_eq!(loaded.skipped_version, "0.9.9");
    assert_eq!(loaded.chat_font_size, 15.0);
    assert_eq!(loaded.window_opacity, 0.8);
    assert!(loaded.auto_send);
    assert!(!loaded.auto_preview_html);
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
fn load_migrates_legacy_hotkey_fields_into_bindings() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("s.json");
    std::fs::write(&path, r#"{"hotkey":"Cmd+Shift+X","scroll_modifier":"Cmd"}"#).unwrap();
    let s = Settings::load(&path).unwrap();
    assert_eq!(crate::hotkeys::effective(&s.hotkeys, crate::hotkeys::ACTION_RECORD), "Cmd+Shift+X");
    assert_eq!(crate::hotkeys::effective(&s.hotkeys, crate::hotkeys::ACTION_SCROLL_CHAT), "Cmd");
}

#[test]
fn load_missing_file_gives_defaults() {
    let s = Settings::load(std::path::Path::new("/nonexistent/x.json")).unwrap();
    assert!(s.hotkeys.is_empty());
    assert!(!s.auto_send);
    assert_eq!(s.move_step, 20);
}

#[test]
fn load_clamps_out_of_range_values() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("s.json");
    std::fs::write(&path, r#"{"window_opacity":0.05,"move_step":999}"#).unwrap();
    let s = Settings::load(&path).unwrap();
    assert_eq!(s.window_opacity, limits::window::OPACITY.min);
    assert_eq!(s.move_step, 200);
}

#[test]
fn save_creates_parent_directories() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("nested/deeper/settings.json");
    Settings::default().save(&path).unwrap();
    assert!(path.exists());
    assert_eq!(leftover_tmp_files(path.parent().unwrap()), 0);
}

fn leftover_tmp_files(dir: &Path) -> usize {
    std::fs::read_dir(dir)
        .unwrap()
        .flatten()
        .filter(|e| e.path().extension().is_some_and(|ext| ext == TMP_FILE_EXTENSION))
        .count()
}

const PARALLEL_WRITERS: usize = 8;

#[test]
fn parallel_atomic_writes_to_one_path_all_succeed() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("chats.json");
    let bodies: Vec<String> = (0..PARALLEL_WRITERS).map(|i| format!("[{i}]")).collect();
    let target = &path;

    std::thread::scope(|scope| {
        for body in &bodies {
            scope.spawn(move || write_atomic_owner_only(target, body).expect("атомарная запись"));
        }
    });

    let written = std::fs::read_to_string(&path).expect("файл на месте");
    assert!(bodies.contains(&written), "{written}");
    assert_eq!(leftover_tmp_files(dir.path()), 0, "временные файлы за собой убраны");
}

#[test]
fn a_failed_write_leaves_no_temporary_file() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("settings.json");
    std::fs::create_dir(&path).unwrap();
    std::fs::write(path.join("занято"), "").unwrap();

    assert!(write_atomic_owner_only(&path, "[]").is_err(), "поверх непустой папки не переименовать");

    assert_eq!(leftover_tmp_files(dir.path()), 0, "хвост оборванной записи убран за собой");
}

fn test_preset() -> PromptPreset {
    PromptPreset { id: "p1".into(), name: "Тест".into(), text: "текст".into() }
}

fn test_quick_action(index: usize) -> QuickAction {
    QuickAction {
        id: format!("q{index}"),
        title: format!("Действие {index}"),
        prompt: format!("Промпт {index}"),
    }
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

#[test]
fn bounds_clamp_keeps_value_inside_range() {
    let b = Bounds { default: 5.0, min: 1.0, max: 10.0 };
    assert_eq!(b.clamp(7.0), 7.0);
    assert_eq!(b.clamp(0.5), 1.0);
    assert_eq!(b.clamp(99.0), 10.0);
}

#[test]
fn bounds_clamp_falls_back_to_default_on_non_finite() {
    let b = Bounds { default: 5.0, min: 1.0, max: 10.0 };
    assert_eq!(b.clamp(f64::NAN), 5.0);
    assert_eq!(b.clamp(f64::INFINITY), 5.0);
    assert_eq!(b.clamp(f64::NEG_INFINITY), 5.0);
}

#[test]
fn every_bound_default_sits_inside_its_own_range() {
    let checked_f64 = [
        limits::window::WIDTH,
        limits::window::HEIGHT,
        limits::window::OPACITY,
        limits::chat::FONT_SIZE,
        limits::teleprompter::SPEED,
        limits::teleprompter::FONT_SIZE,
    ];
    for b in checked_f64 {
        assert!(b.min <= b.default && b.default <= b.max, "нарушен диапазон: {b:?}");
    }
    let checked_u32 = [
        limits::window::MOVE_STEP,
        limits::window::RESIZE_STEP,
        limits::chat::SCROLL_STEP,
        limits::capture::BUFFER_SECONDS,
    ];
    for b in checked_u32 {
        assert!(b.min <= b.default && b.default <= b.max, "нарушен диапазон: {b:?}");
    }
}

#[test]
fn defaults_struct_uses_the_registry_values() {
    let s = Settings::default();
    assert_eq!(s.window_width, limits::window::WIDTH.default);
    assert_eq!(s.window_height, limits::window::HEIGHT.default);
    assert_eq!(s.window_opacity, limits::window::OPACITY.default);
    assert_eq!(s.chat_font_size, limits::chat::FONT_SIZE.default);
    assert_eq!(s.scroll_step, limits::chat::SCROLL_STEP.default);
    assert_eq!(s.teleprompter_speed, limits::teleprompter::SPEED.default);
    assert_eq!(s.buffer_seconds, limits::capture::BUFFER_SECONDS.default);
}

#[test]
fn auto_mode_defaults_are_off_with_speech_paced_bounds() {
    let s = Settings::default();
    assert!(!s.auto_mode_enabled);
    // Ответ по умолчанию ручной: режим слушает и расшифровывает, но в чат
    // ничего не уходит, пока не нажали. Молчаливая трата токенов по умолчанию —
    // не то, чем должно встречать приложение на чистой установке.
    assert!(!s.auto_reply_instant);
    assert!(!s.mic_permission_requested);
    assert_eq!(s.auto_mic_device_uid, "");
    assert_eq!(s.auto_silence_ms, limits::capture::AUTO_SILENCE_MS.default);
    assert_eq!(s.auto_min_utterance_ms, limits::capture::AUTO_MIN_UTTERANCE_MS.default);
    assert_eq!(s.auto_max_utterance_secs, limits::capture::AUTO_MAX_UTTERANCE_SECS.default);
}

#[test]
fn auto_mode_bounds_are_clamped_both_ways() {
    let mut low = Settings {
        auto_silence_ms: 0,
        auto_min_utterance_ms: 0,
        auto_max_utterance_secs: 0,
        ..Default::default()
    };
    low.clamp();
    assert_eq!(low.auto_silence_ms, limits::capture::AUTO_SILENCE_MS.min);
    assert_eq!(low.auto_min_utterance_ms, limits::capture::AUTO_MIN_UTTERANCE_MS.min);
    assert_eq!(low.auto_max_utterance_secs, limits::capture::AUTO_MAX_UTTERANCE_SECS.min);

    let mut high = Settings {
        auto_silence_ms: u32::MAX,
        auto_min_utterance_ms: u32::MAX,
        auto_max_utterance_secs: u32::MAX,
        ..Default::default()
    };
    high.clamp();
    assert_eq!(high.auto_silence_ms, limits::capture::AUTO_SILENCE_MS.max);
    assert_eq!(high.auto_min_utterance_ms, limits::capture::AUTO_MIN_UTTERANCE_MS.max);
    assert_eq!(high.auto_max_utterance_secs, limits::capture::AUTO_MAX_UTTERANCE_SECS.max);
}

#[test]
fn settings_json_without_auto_fields_loads_with_defaults() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("settings.json");
    std::fs::write(&path, r#"{"auto_send":true}"#).unwrap();
    let s = Settings::load(&path).unwrap();
    assert!(!s.auto_mode_enabled);
    assert!(!s.auto_reply_instant);
    assert_eq!(s.auto_silence_ms, limits::capture::AUTO_SILENCE_MS.default);
    assert_eq!(s.auto_mic_device_uid, "");
}

// ---------- schema versioning ----------

#[test]
fn a_fresh_settings_file_is_stamped_with_the_current_schema_version() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("s.json");
    Settings::default().save(&path).unwrap();
    let raw: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
    assert_eq!(raw[SCHEMA_VERSION_KEY], CURRENT_SCHEMA_VERSION);
}

#[test]
fn a_file_without_the_field_is_treated_as_the_legacy_version() {
    let mut value: serde_json::Value = serde_json::from_str(r#"{"auto_send":true}"#).unwrap();
    assert_eq!(document_version(&value), SCHEMA_VERSION_LEGACY);
    assert_eq!(migrate(&mut value, SCHEMA_VERSION_LEGACY), CURRENT_SCHEMA_VERSION);
    assert_eq!(document_version(&value), CURRENT_SCHEMA_VERSION);
}

/// The v0 step is the three former ad-hoc migrations; running it must still do
/// all three, and a document already at the current version must be left alone.
#[test]
fn the_registry_runs_the_legacy_step_exactly_once() {
    let raw = r#"{"theme":"black","anthropic_api_key":"sk-x"}"#;
    let mut value: serde_json::Value = serde_json::from_str(raw).unwrap();
    migrate(&mut value, SCHEMA_VERSION_LEGACY);
    assert_eq!(value["theme"], THEME_DARK);
    assert!(value["onboarding_done"].as_bool().unwrap());
    // …and the v1 step ran after it: the key was read for the inference above
    // and then taken out of the document.
    assert!(value.get("anthropic_api_key").is_none(), "секрет остался в settings.json");

    // Now at the current version: the theme must not be touched a second time.
    value["theme"] = serde_json::Value::String(THEME_LIGHT.into());
    migrate(&mut value, CURRENT_SCHEMA_VERSION);
    assert_eq!(value["theme"], THEME_LIGHT);
}

/// A file written by a NEWER build is not migrated backwards and keeps its own
/// version stamp, so a re-run of the newer build still recognises it.
#[test]
fn a_future_version_is_left_alone() {
    let future = CURRENT_SCHEMA_VERSION + 5;
    let mut value = serde_json::json!({"schema_version": future, "theme": "gray"});
    assert_eq!(migrate(&mut value, future), future);
    assert_eq!(value["theme"], "gray", "чужая версия не мигрируется назад");
}

#[test]
fn a_legacy_file_still_loads_and_migrates_end_to_end() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("s.json");
    std::fs::write(&path, r#"{"theme":"gray","groq_api_key":"gsk"}"#).unwrap();
    let s = Settings::load(&path).unwrap();
    assert_eq!(s.theme, THEME_DARK);
    assert!(s.onboarding_done);
    assert_eq!(s.schema_version, CURRENT_SCHEMA_VERSION);
}

// ---------- corruption quarantine ----------

#[test]
fn a_missing_file_gives_defaults_and_no_recovery_record() {
    let dir = tempfile::tempdir().unwrap();
    let (s, recovery) = load_or_recover(&dir.path().join("absent.json"));
    assert_eq!(s, Settings::default());
    assert!(recovery.is_none());
}

#[test]
fn a_readable_file_gives_settings_and_no_recovery_record() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("s.json");
    std::fs::write(&path, r#"{"skipped_version":"1.2.3"}"#).unwrap();
    let (s, recovery) = load_or_recover(&path);
    assert_eq!(s.skipped_version, "1.2.3");
    assert!(recovery.is_none());
}

/// The regression this whole outcome exists for: a paid access token used to be
/// replaced by defaults silently, and the very next write made the loss
/// permanent. The bytes must survive under a new name.
#[test]
fn a_corrupt_file_is_renamed_aside_and_reported() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("settings.json");
    let broken = r#"{"access_token": "itk_paid", "#;
    std::fs::write(&path, broken).unwrap();

    let (s, recovery) = load_or_recover(&path);
    assert_eq!(s, Settings::default(), "битый файл не выдаёт мусорных настроек");
    let recovery = recovery.expect("факт порчи обязан дойти до фронта");
    assert!(!path.exists(), "битый файл убран с дороги");
    let backup = std::path::Path::new(&recovery.backup_path);
    assert_eq!(std::fs::read_to_string(backup).unwrap(), broken);
    assert!(!recovery.reason.is_empty());
}

/// A field whose TYPE changed is the realistic trigger — `#[serde(default)]`
/// sits on the container, so it fills in a MISSING field but not a wrong one.
#[test]
fn a_field_with_the_wrong_type_counts_as_corruption_not_as_a_missing_field() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("settings.json");
    std::fs::write(&path, r#"{"window_width":"960","access_token":"itk_paid"}"#).unwrap();
    let (_, recovery) = load_or_recover(&path);
    assert!(recovery.is_some(), "неверный тип поля не должен молча стирать файл");
}

// ---------- SettingsService ----------

fn service(dir: &tempfile::TempDir) -> SettingsService {
    let path = dir.path().join("settings.json");
    SettingsService::new(path, Settings::default(), None)
}

#[test]
fn update_clamps_persists_and_returns_both_halves() {
    let dir = tempfile::tempdir().unwrap();
    let svc = service(&dir);
    let applied = svc.update(|s| s.window_width = 99_999.0).unwrap();
    assert_eq!(applied.old.window_width, limits::window::WIDTH.default);
    assert_eq!(applied.new.window_width, limits::window::WIDTH.max);
    assert_eq!(svc.get().window_width, limits::window::WIDTH.max);
    assert_eq!(
        Settings::load(svc.path()).unwrap().window_width,
        limits::window::WIDTH.max,
        "изменение обязано лежать на диске, а не только в памяти"
    );
}

#[test]
fn an_update_that_changes_nothing_writes_nothing() {
    let dir = tempfile::tempdir().unwrap();
    let svc = service(&dir);
    svc.update(|_| {}).unwrap();
    assert!(!svc.path().exists(), "автосохранение без изменений не трогает диск");
}

/// The reproducible loss the lock was built for: one writer saves a field while
/// the launcher's autosave writes another from a snapshot taken before it. With
/// read-modify-write outside the lock one of the two always won; both must
/// survive now. (Its access-token half now lives in `secrets::tests`.)
#[test]
fn two_concurrent_updates_of_two_fields_both_survive() {
    let dir = tempfile::tempdir().unwrap();
    let svc = std::sync::Arc::new(service(&dir));
    let barrier = std::sync::Arc::new(std::sync::Barrier::new(2));

    let version_writer = {
        let svc = std::sync::Arc::clone(&svc);
        let barrier = std::sync::Arc::clone(&barrier);
        std::thread::spawn(move || {
            barrier.wait();
            for _ in 0..50 {
                svc.update(|s| s.skipped_version = "9.9.9".into()).unwrap();
            }
        })
    };
    let flag_writer = {
        let svc = std::sync::Arc::clone(&svc);
        let barrier = std::sync::Arc::clone(&barrier);
        std::thread::spawn(move || {
            barrier.wait();
            for _ in 0..50 {
                svc.update(|s| s.audio_permission_requested = true).unwrap();
            }
        })
    };
    version_writer.join().unwrap();
    flag_writer.join().unwrap();

    let live = svc.get();
    assert_eq!(live.skipped_version, "9.9.9");
    assert!(live.audio_permission_requested);
    let on_disk = Settings::load(svc.path()).unwrap();
    assert_eq!(on_disk.skipped_version, "9.9.9");
    assert!(on_disk.audio_permission_requested);
}

#[test]
fn a_counter_incremented_from_two_threads_loses_no_increment() {
    let dir = tempfile::tempdir().unwrap();
    let svc = std::sync::Arc::new(service(&dir));
    let threads: Vec<_> = (0..4)
        .map(|_| {
            let svc = std::sync::Arc::clone(&svc);
            std::thread::spawn(move || {
                for _ in 0..25 {
                    svc.update(|s| s.move_step += 1).unwrap();
                }
            })
        })
        .collect();
    for t in threads {
        t.join().unwrap();
    }
    // 100 increments from the default, clamped at the registry maximum.
    let expected = limits::window::MOVE_STEP.clamp(limits::window::MOVE_STEP.default + 100);
    assert_eq!(svc.get().move_step, expected);
}

#[test]
fn try_get_answers_when_the_lock_is_free() {
    let dir = tempfile::tempdir().unwrap();
    let svc = service(&dir);
    assert!(svc.try_get().is_some());
}

/// The mode is set at `open` time rather than by a later `chmod`, and that is
/// the point: the content goes into the TEMPORARY file, so a file that is
/// tightened only afterwards is world-readable for exactly as long as it holds
/// the API keys.
#[cfg(unix)]
#[test]
fn a_file_is_owner_only_before_anything_is_written_into_it() {
    use std::os::unix::fs::PermissionsExt;
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("settings.json");
    let _file = create_owner_only(&path).unwrap();
    let mode = std::fs::metadata(&path).unwrap().permissions().mode();
    assert_eq!(mode & 0o777, 0o600);
}

/// `create_new` is what keeps a stale temporary file left by a crashed process
/// from being reused — along with whatever permissions it happens to carry.
#[test]
fn creating_over_an_existing_file_is_refused() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("settings.json.tmp");
    std::fs::write(&path, "{}").unwrap();
    assert!(create_owner_only(&path).is_err());
}
