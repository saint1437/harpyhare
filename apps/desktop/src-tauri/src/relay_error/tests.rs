use super::*;

/// The whole table, code by code. This is the cross-repo contract in test form:
/// a code renamed or dropped in `itech-relay` shows up here as a mapping that no
/// longer matches its README row.
#[test]
fn every_worker_code_maps_to_an_app_code() {
    let expected: &[(&str, ErrorCode)] = &[
        ("invalid_token", ErrorCode::BadAccessCode),
        ("not_found", ErrorCode::Api),
        ("internal_error", ErrorCode::Api),
        ("bad_request", ErrorCode::Api),
        ("malformed_json", ErrorCode::Api),
        ("empty_body", ErrorCode::Api),
        ("request_too_large", ErrorCode::RequestTooLarge),
        ("audio_too_long", ErrorCode::AudioTooLong),
        ("model_not_allowed", ErrorCode::ModelNotAllowed),
        ("daily_limit_exceeded", ErrorCode::DailyLimitExceeded),
        ("too_many_attempts", ErrorCode::TooManyAttempts),
        ("redeem_failed", ErrorCode::BadAccessCode),
        ("request_cancelled", ErrorCode::Cancelled),
        ("recording_cancelled", ErrorCode::Cancelled),
        ("provider_unreachable", ErrorCode::ProviderUnreachable),
        ("service_misconfigured", ErrorCode::ServiceUnavailable),
        ("context_too_long", ErrorCode::ContextTooLong),
        ("upstream_overloaded", ErrorCode::Retryable),
        ("upstream_rejected", ErrorCode::Api),
        ("upstream_unavailable", ErrorCode::ProviderUnreachable),
        ("admin_bad_json", ErrorCode::Api),
        ("admin_revoke_target_required", ErrorCode::Api),
    ];
    assert_eq!(expected.len(), 22, "воркер отдаёт ровно 22 кода");
    for (name, code) in expected {
        assert_eq!(map_code(name), Some(*code), "код воркера {name}");
    }
    assert_eq!(RELAY_CODES.len(), expected.len(), "лишний или недостающий код в таблице");
}

#[test]
fn a_body_without_a_code_is_not_a_relay_error() {
    assert_eq!(parse(r#"{"error":{"message":"что-то"}}"#), None);
    assert_eq!(parse(r#"{"error":{"code":"   ","message":"x"}}"#), None);
    assert_eq!(parse("not json at all"), None);
    assert_eq!(parse(r#"{"message":"без обёртки"}"#), None);
}

#[test]
fn an_unknown_code_falls_back_to_the_message() {
    let parsed = parse(r#"{"error":{"code":"brand_new_thing","message":"Новая беда"}}"#).unwrap();
    assert_eq!(parsed.code, ErrorCode::Api);
    assert_eq!(parsed.message, "Новая беда");
    assert_eq!(parsed.params.get(param::DETAILS).map(String::as_str), Some("Новая беда"));
}

#[test]
fn params_arrive_as_strings_and_non_scalars_are_dropped() {
    let parsed = parse(
        r#"{"error":{"code":"request_too_large","message":"Слишком большой запрос",
           "params":{"limitMb":32,"nested":{"a":1},"flag":true}}}"#,
    )
    .unwrap();
    assert_eq!(parsed.code, ErrorCode::RequestTooLarge);
    assert_eq!(parsed.params.get("limitMb").map(String::as_str), Some("32"));
    assert_eq!(parsed.params.get("flag").map(String::as_str), Some("true"));
    assert!(!parsed.params.contains_key("nested"), "объект в params не подставляется");
}

#[test]
fn a_known_code_keeps_its_message_out_of_details() {
    let parsed = parse(r#"{"error":{"code":"daily_limit_exceeded","message":"Лимит"}}"#).unwrap();
    assert_eq!(parsed.message, "Лимит");
    assert!(
        !parsed.params.contains_key(param::DETAILS),
        "у известного кода фраза берётся из словаря, а не из воркера"
    );
}

#[test]
fn only_transient_failures_are_worth_a_retry() {
    let retryable = parse(r#"{"error":{"code":"upstream_overloaded","message":"x"}}"#).unwrap();
    assert!(retryable.should_retry());
    let unreachable = parse(r#"{"error":{"code":"provider_unreachable","message":"x"}}"#).unwrap();
    assert!(unreachable.should_retry());
    let owner = parse(r#"{"error":{"code":"service_misconfigured","message":"x"}}"#).unwrap();
    assert!(!owner.should_retry(), "проблема владельца прокси повтором не лечится");
    let budget = parse(r#"{"error":{"code":"daily_limit_exceeded","message":"x"}}"#).unwrap();
    assert!(!budget.should_retry());
}
