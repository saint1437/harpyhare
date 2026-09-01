use super::*;

fn with_key(base: &settings::Settings, key_id: &str, value: &str) -> settings::Settings {
    let mut json = serde_json::to_value(base).expect("настройки сериализуются");
    let field = format!("{key_id}_api_key");
    assert!(
        json.get(&field).is_some(),
        "key_id {key_id} не указывает ни на одно поле настроек ({field})"
    );
    json[&field] = serde_json::Value::String(value.into());
    serde_json::from_value(json).expect("настройки десериализуются обратно")
}

#[test]
fn every_speech_vendor_key_triggers_a_client_rebuild() {
    let blank = settings::Settings::default();
    for spec in crate::stt::registry::PROVIDERS {
        let edited = with_key(&blank, spec.key_id, "новый");
        assert!(
            stt_credentials_changed(&blank, &edited),
            "правка ключа {} вендора {} обязана пересобрать STT-клиент",
            spec.key_id,
            spec.id
        );
    }
}

#[test]
fn every_answer_vendor_key_triggers_a_client_rebuild() {
    let blank = settings::Settings::default();
    for spec in crate::llm::registry::PROVIDERS {
        let edited = with_key(&blank, spec.key_id, "новый");
        assert!(
            llm_credentials_changed(&blank, &edited),
            "правка ключа {} вендора {} обязана пересобрать LLM-клиент",
            spec.key_id,
            spec.id
        );
    }
}

#[test]
fn untouched_settings_rebuild_nothing() {
    let s = with_key(&settings::Settings::default(), "groq", "g");
    assert!(!stt_credentials_changed(&s, &s));
    assert!(!llm_credentials_changed(&s, &s));
}

#[test]
fn direct_env_keys_still_apply_when_access_code_is_present() {
    let mut s = settings::Settings {
        access_token: "itk_test".into(),
        ..Default::default()
    };
    apply_direct_env_key_fallback(
        &mut s,
        Some(" xclis-test ".into()),
        Some(" deepgram-test ".into()),
    );
    assert_eq!(s.xclis_api_key, "xclis-test");
    assert_eq!(s.deepgram_api_key, "deepgram-test");
}

#[test]
fn direct_env_keys_do_not_override_saved_values_or_accept_blanks() {
    let mut s = settings::Settings {
        xclis_api_key: "saved-xclis".into(),
        ..Default::default()
    };
    apply_direct_env_key_fallback(&mut s, Some("env-xclis".into()), Some("   ".into()));
    assert_eq!(s.xclis_api_key, "saved-xclis");
    assert_eq!(s.deepgram_api_key, "");
}