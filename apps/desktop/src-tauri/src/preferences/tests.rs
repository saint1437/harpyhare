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
