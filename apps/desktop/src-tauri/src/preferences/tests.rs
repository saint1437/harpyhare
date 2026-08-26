use super::*;
use crate::secrets::{ApiKeyKind, Secrets};
use crate::settings::Settings;
use SettingsEffect::*;

fn effects(mutate: impl FnOnce(&mut Settings)) -> Vec<SettingsEffect> {
    let old = Settings::default();
    let mut new = old.clone();
    mutate(&mut new);
    settings_effects(&old, &new)
}

#[test]
fn an_unchanged_settings_object_asks_for_nothing() {
    assert!(effects(|_| {}).is_empty());
}

/// The table the seven scattered `if`s used to be. One row per field that has a
/// side effect; a field missing from it changes nothing but the stored value.
#[test]
fn every_field_with_a_side_effect_asks_for_exactly_its_own() {
    type Case = (&'static str, fn(&mut Settings), &'static [SettingsEffect]);
    let cases: &[Case] = &[
        ("stt_language", |s| s.stt_language = "en".into(), &[RebuildStt]),
        ("stt_translate", |s| s.stt_translate = true, &[RebuildStt]),
        (
            "hotkeys",
            |s| {
                s.hotkeys = vec![crate::hotkeys::HotkeyBinding {
                    action: crate::hotkeys::ACTION_RECORD.into(),
                    combo: "F8".into(),
                }]
            },
            &[ReregisterHotkeys],
        ),
        ("capture_device_uid", |s| s.capture_device_uid = "uid".into(), &[RebuildCapture]),
        ("auto_mic_device_uid", |s| s.auto_mic_device_uid = "mic".into(), &[RestartAuto]),
        ("auto_silence_ms", |s| s.auto_silence_ms = 900, &[ReapplyAutoBounds]),
        ("auto_min_utterance_ms", |s| s.auto_min_utterance_ms = 500, &[ReapplyAutoBounds]),
        ("auto_max_utterance_secs", |s| s.auto_max_utterance_secs = 40, &[ReapplyAutoBounds]),
        ("screen_share_visible", |s| s.screen_share_visible = true, &[ApplyContentProtection]),
        ("buffer_enabled", |s| s.buffer_enabled = false, &[ApplyBuffer]),
        ("buffer_seconds", |s| s.buffer_seconds = 9, &[ApplyBuffer]),
        ("window_width", |s| s.window_width = 1000.0, &[]),
        ("theme", |s| s.theme = crate::settings::THEME_DARK.into(), &[]),
        ("auto_send", |s| s.auto_send = true, &[]),
    ];
    for (name, mutate, expected) in cases {
        assert_eq!(effects(mutate), *expected, "поле {name}");
    }
}

/// Changing the microphone restarts the mode, which re-arms the segmenters on
/// its own — asking for both would re-arm a capture that is being torn down.
#[test]
fn a_microphone_change_restarts_instead_of_re_arming() {
    let got = effects(|s| {
        s.auto_mic_device_uid = "mic".into();
        s.auto_silence_ms = 900;
    });
    assert_eq!(got, vec![RestartAuto]);
}

// ---------- the secrets' own effect table ----------

fn secret_effects(mutate: impl FnOnce(&mut Secrets)) -> Vec<SecretsEffect> {
    let old = Secrets::default();
    let mut new = old.clone();
    mutate(&mut new);
    secrets_effects(&old, &new)
}

#[test]
fn unchanged_secrets_ask_for_nothing() {
    assert!(secret_effects(|_| {}).is_empty());
}

/// The credentials left `Settings`, so their side effects left `settings_effects`
/// with them. The rule is unchanged: the token feeds BOTH clients, each key
/// feeds one.
#[test]
fn every_secret_asks_for_exactly_the_client_it_feeds() {
    use SecretsEffect::{RebuildLlm as Llm, RebuildStt as Stt};
    type Case = (&'static str, fn(&mut Secrets), &'static [SecretsEffect]);
    let cases: &[Case] = &[
        ("groq_api_key", |s| s.set_key(ApiKeyKind::Groq, "gsk_x"), &[Stt]),
        ("anthropic_api_key", |s| s.set_key(ApiKeyKind::Anthropic, "sk-x"), &[Llm]),
        ("access_token", |s| s.access_token = "itk".into(), &[Stt, Llm]),
    ];
    for (name, mutate, expected) in cases {
        assert_eq!(secret_effects(mutate), *expected, "поле {name}");
    }
}

/// A cleared key is a change like any other — the client has to come back
/// without it, or the app keeps talking to Anthropic with a key the user
/// believes they deleted.
#[test]
fn clearing_a_key_rebuilds_its_client_too() {
    let old = Secrets { groq_api_key: "gsk_x".into(), ..Default::default() };
    let mut new = old.clone();
    new.clear_key(ApiKeyKind::Groq);
    assert_eq!(secrets_effects(&old, &new), vec![SecretsEffect::RebuildStt]);
}

/// Unlinking a code sends both clients back to the user's own keys.
#[test]
fn clearing_the_access_code_rebuilds_both_clients() {
    let old = Secrets { access_token: "itk".into(), ..Default::default() };
    let mut new = old.clone();
    new.clear_access_token();
    assert_eq!(
        secrets_effects(&old, &new),
        vec![SecretsEffect::RebuildStt, SecretsEffect::RebuildLlm]
    );
}

/// «Пустая строка не затирает» has to hold at the command's level too: no
/// change means no write and no client rebuild.
#[test]
fn an_empty_value_is_not_a_change_at_all() {
    let old = Secrets { anthropic_api_key: "sk-kept".into(), ..Default::default() };
    let mut new = old.clone();
    new.set_key(ApiKeyKind::Anthropic, "");
    assert_eq!(new.anthropic_api_key, "sk-kept");
    assert!(secrets_effects(&old, &new).is_empty());
}
