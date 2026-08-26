use super::*;
use crate::error::ErrorCode;

/// The names are the contract with `src/ipc/events.ts`. Nothing but running the
/// app used to notice a typo in one of them; now a rename fails here.
#[test]
fn every_helper_emits_its_own_documented_name() {
    let bus = RecordedEvents::default();

    state_changed(&bus, RecorderState::Recording);
    transcript_ready(&bus, "текст".into());
    stt_error(&bus, AppError::new(ErrorCode::Silence, "тихо"));
    llm_delta(&bus, "chat-1", "дель".into());
    llm_done(&bus, "chat-1".into());
    llm_error(&bus, "chat-1".into(), AppError::new(ErrorCode::Network, "нет сети"));
    llm_usage(&bus, "chat-1", 42);
    toggle_teleprompter(&bus);
    resize_key(&bus, 1, 0);
    update_available(&bus, UpdateInfo { version: "1.0.0".into(), notes: String::new() });
    update_progress(&bus, 10, Some(100));
    update_done(&bus, "1.0.0".into());
    official_presets_updated(&bus, Vec::new());
    screenshot_ready(&bus, ScreenshotReady { media_type: "image/png".into(), data_base64: String::new() });
    screenshot_error(&bus, AppError::new(ErrorCode::Permission, "нет прав"));
    focus_prompt(&bus);
    auto_turn(&bus, AutoTurnPayload { speaker: crate::auto::Speaker::User, text: "я".into(), seq: 0 });
    auto_mode_changed(&bus, true);
    auto_mode_error(&bus, AppError::new(ErrorCode::Internal, "сбой"));
    auto_answer(&bus);
    audio_level(&bus, 0.5);
    collapsed_changed(&bus, true);

    assert_eq!(
        bus.names(),
        vec![
            EVENT_STATE_CHANGED,
            EVENT_TRANSCRIPT_READY,
            EVENT_STT_ERROR,
            EVENT_LLM_DELTA,
            EVENT_LLM_DONE,
            EVENT_LLM_ERROR,
            EVENT_LLM_USAGE,
            EVENT_TOGGLE_TELEPROMPTER,
            EVENT_RESIZE_KEY,
            EVENT_UPDATE_AVAILABLE,
            EVENT_UPDATE_PROGRESS,
            EVENT_UPDATE_DONE,
            EVENT_OFFICIAL_PRESETS_UPDATED,
            EVENT_SCREENSHOT_READY,
            EVENT_SCREENSHOT_ERROR,
            EVENT_FOCUS_PROMPT,
            EVENT_AUTO_TURN,
            EVENT_AUTO_MODE_CHANGED,
            EVENT_AUTO_MODE_ERROR,
            EVENT_AUTO_ANSWER,
            EVENT_AUDIO_LEVEL,
            EVENT_COLLAPSED_CHANGED,
        ]
    );
}

/// `llm-error` carries the code and the message as explicit fields, NOT through
/// `serde(flatten)` — specta would not export a flattened type, and the
/// frontend branches on `code` alone.
#[test]
fn the_llm_error_payload_carries_a_camel_case_code_beside_the_chat_id() {
    let bus = RecordedEvents::default();
    llm_error(&bus, "chat-7".into(), AppError::new(ErrorCode::BadAccessCode, "код не принят"));
    let payload = bus.payload(EVENT_LLM_ERROR).unwrap();
    assert_eq!(payload["chatId"], "chat-7");
    assert_eq!(payload["code"], "badAccessCode");
    assert_eq!(payload["message"], "код не принят");
}

/// `resize-key.dim` is the Rust enum rendered lowercase, not a free string.
#[test]
fn the_resize_payload_names_the_dimension_the_arrow_changed() {
    let horizontal = RecordedEvents::default();
    resize_key(&horizontal, -1, 0);
    assert_eq!(horizontal.payload(EVENT_RESIZE_KEY).unwrap()["dim"], "width");
    assert_eq!(horizontal.payload(EVENT_RESIZE_KEY).unwrap()["dir"], -1);

    let vertical = RecordedEvents::default();
    resize_key(&vertical, 0, 1);
    assert_eq!(vertical.payload(EVENT_RESIZE_KEY).unwrap()["dim"], "height");
}

#[test]
fn the_stream_payloads_carry_the_chat_id_in_camel_case() {
    let bus = RecordedEvents::default();
    llm_delta(&bus, "c", "x".into());
    llm_done(&bus, "c".into());
    llm_usage(&bus, "c", 7);
    assert_eq!(bus.payload(EVENT_LLM_DELTA).unwrap()["chatId"], "c");
    assert_eq!(bus.payload(EVENT_LLM_DONE).unwrap()["chatId"], "c");
    assert_eq!(bus.payload(EVENT_LLM_USAGE).unwrap()["inputTokens"], 7);
}

/// Empty-payload events must stay empty: the frontend listens for the press,
/// not for data.
#[test]
fn the_signal_only_events_carry_nothing() {
    let bus = RecordedEvents::default();
    focus_prompt(&bus);
    auto_answer(&bus);
    toggle_teleprompter(&bus);
    for name in [EVENT_FOCUS_PROMPT, EVENT_AUTO_ANSWER, EVENT_TOGGLE_TELEPROMPTER] {
        assert_eq!(bus.payload(name).unwrap(), serde_json::Value::Null, "{name}");
    }
}
