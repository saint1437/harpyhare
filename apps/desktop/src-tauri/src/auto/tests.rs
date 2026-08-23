use super::*;

fn settings_with(silence_ms: u32, min_ms: u32, max_secs: u32) -> settings::Settings {
    settings::Settings {
        auto_silence_ms: silence_ms,
        auto_min_utterance_ms: min_ms,
        auto_max_utterance_secs: max_secs,
        ..Default::default()
    }
}

#[test]
fn segmenter_bounds_come_from_settings() {
    let bounds = segmenter_bounds(&settings_with(900, 500, 40));
    assert_eq!(bounds.silence_ms, 900);
    assert_eq!(bounds.min_utterance_ms, 500);
    assert_eq!(bounds.max_utterance_secs, 40);
}

#[test]
fn segmenter_bounds_follow_clamped_defaults() {
    let mut s = settings::Settings {
        auto_silence_ms: u32::MAX,
        ..Default::default()
    };
    s.clamp();
    let bounds = segmenter_bounds(&s);
    assert_eq!(bounds.silence_ms, settings::limits::capture::AUTO_SILENCE_MS.max as usize);
}

#[test]
fn in_flight_counters_are_independent_per_speaker() {
    let auto = AutoState::default();
    auto.in_flight(Speaker::Interviewer).fetch_add(1, Ordering::AcqRel);
    assert_eq!(auto.in_flight(Speaker::Interviewer).load(Ordering::Acquire), 1);
    assert_eq!(auto.in_flight(Speaker::User).load(Ordering::Acquire), 0);
}

#[test]
fn speakers_serialize_to_the_frontend_labels() {
    assert_eq!(serde_json::to_string(&Speaker::Interviewer).unwrap(), "\"interviewer\"");
    assert_eq!(serde_json::to_string(&Speaker::User).unwrap(), "\"user\"");
}

#[test]
fn recorder_busy_error_is_coded_not_prose_matched() {
    assert_eq!(recorder_busy_error().code, ErrorCode::Internal);
    assert!(!recorder_busy_error().message.is_empty());
}

#[test]
fn only_the_microphone_device_forces_a_capture_restart() {
    let old = settings::Settings::default();
    let mut mic = old.clone();
    mic.auto_mic_device_uid = "usb-mic".into();
    assert!(device_changed(&old, &mic));
    assert!(!bounds_changed(&old, &mic));
}

#[test]
fn segmenter_thresholds_are_a_bounds_change_not_a_restart() {
    let old = settings::Settings::default();
    for tweak in [
        |s: &mut settings::Settings| s.auto_silence_ms += 50,
        |s: &mut settings::Settings| s.auto_min_utterance_ms += 50,
        |s: &mut settings::Settings| s.auto_max_utterance_secs += 5,
    ] {
        let mut next = old.clone();
        tweak(&mut next);
        assert!(bounds_changed(&old, &next), "threshold change must re-arm segmenters");
        assert!(!device_changed(&old, &next), "a threshold must not rebuild the devices");
    }
}

#[test]
fn unrelated_settings_touch_neither_path() {
    let old = settings::Settings::default();
    let mut unrelated = old.clone();
    unrelated.auto_send = !old.auto_send;
    unrelated.chat_font_size += 1.0;
    assert!(!device_changed(&old, &unrelated));
    assert!(!bounds_changed(&old, &unrelated));
}
