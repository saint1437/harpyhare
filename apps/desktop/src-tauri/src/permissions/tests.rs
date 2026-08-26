use super::*;

#[test]
fn granted_flag_maps_to_state() {
    assert_eq!(state_from_granted(true), PermissionState::Granted);
    assert_eq!(state_from_granted(false), PermissionState::Denied);
}

#[test]
fn states_serialize_in_snake_case_for_the_front() {
    let json = serde_json::to_string(&PermissionsStatus {
        audio: PermissionState::Unknown,
        screen: PermissionState::Granted,
        microphone: PermissionState::Denied,
    })
    .unwrap();
    assert_eq!(
        json,
        r#"{"audio":"unknown","screen":"granted","microphone":"denied"}"#
    );
}

#[test]
fn kind_parses_from_front_payload() {
    let audio: PermissionKind = serde_json::from_str("\"audio\"").unwrap();
    let screen: PermissionKind = serde_json::from_str("\"screen\"").unwrap();
    let microphone: PermissionKind = serde_json::from_str("\"microphone\"").unwrap();
    assert_eq!(audio, PermissionKind::Audio);
    assert_eq!(screen, PermissionKind::Screen);
    assert_eq!(microphone, PermissionKind::Microphone);
    assert!(serde_json::from_str::<PermissionKind>("\"camera\"").is_err());
}

#[test]
fn a_fresh_cache_is_unknown_and_stale() {
    let cache = PermissionCache::default();
    assert_eq!(cache.snapshot(), PermissionsStatus::default());
    assert!(cache.is_stale(), "ни одной пробы ещё не было");
}

#[test]
fn storing_a_probe_makes_the_cache_fresh_until_invalidated() {
    let cache = PermissionCache::default();
    let probed = PermissionsStatus {
        audio: PermissionState::Granted,
        screen: PermissionState::Denied,
        microphone: PermissionState::Unknown,
    };
    cache.store(probed);
    assert_eq!(cache.snapshot(), probed);
    assert!(!cache.is_stale(), "свежая проба не требует повторной");
    cache.invalidate();
    assert!(cache.is_stale(), "инвалидация возвращает пробу в расписание");
    assert_eq!(cache.snapshot(), probed, "значение остаётся до новой пробы");
}

#[test]
fn state_of_picks_the_requested_permission() {
    let status = PermissionsStatus {
        audio: PermissionState::Granted,
        screen: PermissionState::Denied,
        microphone: PermissionState::Unknown,
    };
    assert_eq!(state_of(&status, PermissionKind::Audio), PermissionState::Granted);
    assert_eq!(state_of(&status, PermissionKind::Screen), PermissionState::Denied);
    assert_eq!(state_of(&status, PermissionKind::Microphone), PermissionState::Unknown);
}

/// The command must not answer `unknown` from a cache that has never been
/// filled: the launcher asks once on mount, and a cold answer would leave the
/// launch gate shut on a machine that has the permission.
#[test]
fn a_cache_that_has_never_been_probed_says_so() {
    let cache = PermissionCache::default();
    assert!(cache.never_probed());
    cache.store(PermissionsStatus::default());
    assert!(!cache.never_probed(), "проба была, пусть и с тем же ответом");
    cache.invalidate();
    assert!(cache.never_probed(), "инвалидация возвращает кэш в холодное состояние");
}
