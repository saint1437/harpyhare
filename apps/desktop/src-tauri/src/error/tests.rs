use super::*;
use crate::llm::LlmError;
use crate::stt::SttError;

#[test]
fn llm_errors_map_to_codes() {
    assert_eq!(LlmError::BadApiKey.code(), ErrorCode::BadApiKey);
    assert_eq!(LlmError::retryable(503).code(), ErrorCode::Retryable);
    assert_eq!(LlmError::Network("x".into()).code(), ErrorCode::Network);
    assert_eq!(LlmError::Api("x".into()).code(), ErrorCode::Api);
    assert_eq!(LlmError::Cancelled.code(), ErrorCode::Cancelled);
    assert_eq!(
        LlmError::BadAccessCode("x".into()).code(),
        ErrorCode::BadAccessCode,
        "прокси-401 обязан приходить тем же кодом, что и у распознавания"
    );
}

/// The command layer takes `?` on a domain error, so the by-value conversions
/// have to exist for every one of them.
#[test]
fn domain_errors_convert_into_app_error_by_value() {
    let llm: AppError = LlmError::BadApiKey.into();
    assert_eq!(llm.code, ErrorCode::BadApiKey);
    let stt: AppError = SttError::retryable(503).into();
    assert_eq!(stt.code, ErrorCode::Retryable);
    let capture: AppError = crate::capture::CaptureError::PermissionDenied.into();
    assert_eq!(capture.code, ErrorCode::Permission);
    let io: AppError =
        std::io::Error::new(std::io::ErrorKind::PermissionDenied, "нет прав").into();
    assert_eq!(io.code, ErrorCode::Internal);
}

#[test]
fn stt_errors_map_to_codes() {
    assert_eq!(SttError::BadApiKey.code(), ErrorCode::BadApiKey);
    assert_eq!(
        SttError::BadAccessCode("x".into()).code(),
        ErrorCode::BadAccessCode
    );
    assert_eq!(SttError::retryable(429).code(), ErrorCode::Retryable);
    assert_eq!(SttError::Network("x".into()).code(), ErrorCode::Network);
    assert_eq!(SttError::Other("x".into()).code(), ErrorCode::Api);
}

#[test]
fn app_error_carries_code_and_display_message() {
    let err = AppError::from(&SttError::retryable(429));
    assert_eq!(err.code, ErrorCode::Retryable);
    assert!(err.message.contains("429"), "got: {}", err.message);
}

#[test]
fn codes_serialize_as_camel_case() {
    let json = serde_json::to_string(&AppError::new(ErrorCode::BadAccessCode, "нет")).unwrap();
    assert_eq!(json, r#"{"code":"badAccessCode","message":"нет","params":{}}"#);
}

/// The three halves of the contract in one assertion: a stable code, machine
/// params the frontend substitutes, and a Russian `message` that stays put as
/// the log line and the last-resort text.
#[test]
fn params_travel_beside_the_code_and_are_sorted() {
    let err = AppError::with_params(
        ErrorCode::ModelNotAllowed,
        "Модель недоступна",
        params_of([(param::MODEL, "gpt-4o".into()), (param::LIMIT_MB, "32".into())]),
    );
    let json = serde_json::to_string(&err).unwrap();
    assert_eq!(
        json,
        r#"{"code":"modelNotAllowed","message":"Модель недоступна","params":{"limitMb":"32","model":"gpt-4o"}}"#
    );
}

/// Ни один параметр не должен быть готовой фразой: `details` — единственное
/// исключение, и это чужой текст, который словарь всё равно не переведёт.
#[test]
fn a_domain_error_hands_its_machine_values_over() {
    let err = AppError::from(&crate::llm::LlmError::Retryable(503, "перегружен".into()));
    assert_eq!(err.code, ErrorCode::Retryable);
    assert_eq!(err.params.get(param::STATUS).map(String::as_str), Some("503"));
    assert_eq!(err.params.get(param::DETAILS).map(String::as_str), Some("перегружен"));
    assert_eq!(err.message, "перегружен", "message остаётся русским");
}

/// A code the worker invented after this build shipped still reaches the user:
/// the generic `api` frame with the worker's own sentence quoted inside it.
#[test]
fn an_unknown_worker_code_falls_back_to_its_message() {
    let relay = crate::relay_error::parse(r#"{"error":{"code":"tomorrows_code","message":"Беда"}}"#)
        .expect("тело с code разбирается");
    let err = AppError::from(&crate::llm::LlmError::relay(relay));
    assert_eq!(err.code, ErrorCode::Api);
    assert_eq!(err.message, "Беда");
    assert_eq!(err.params.get(param::DETAILS).map(String::as_str), Some("Беда"));
}

/// Every worker code the app can meet must land on a variant the frontend has a
/// phrase for; `relay_error/tests.rs` owns the full table, this one owns the
/// direction — a code is never lost on the way into `AppError`.
#[test]
fn worker_codes_reach_app_error_with_their_params() {
    let relay = crate::relay_error::parse(
        r#"{"error":{"code":"too_many_attempts","message":"Позже","params":{"retryAfterSeconds":600}}}"#,
    )
    .unwrap();
    let err = AppError::from(&crate::access::AccessError::relay(relay));
    assert_eq!(err.code, ErrorCode::TooManyAttempts);
    assert_eq!(
        err.params.get(param::RETRY_AFTER_SECONDS).map(String::as_str),
        Some("600")
    );
}

/// The subject vocabulary is a contract with `src/i18n/errors-*.ts`: the
/// frontend record is exhaustive over exactly this list. A duplicate here would
/// pass `tsc` on the other side while meaning two different things.
#[test]
fn subjects_are_unique_and_non_empty() {
    let mut seen = std::collections::BTreeSet::new();
    for s in subject::ALL {
        assert!(!s.trim().is_empty(), "пустой subject");
        assert!(seen.insert(*s), "дубликат subject: {s}");
    }
    assert_eq!(seen.len(), subject::ALL.len());
}

/// Every subject a construction site can attach must be in `ALL` — that list is
/// what the frontend test reads, and a subject missing from it is a phrase the
/// dictionary was never asked for.
#[test]
fn constructed_subjects_are_declared() {
    let sites = [
        crate::capture::no_capture_error(),
        crate::capture::silence_error(),
        crate::capture_service::CaptureMode::Ptt.busy_error(),
        crate::capture_service::CaptureMode::AutoListening.busy_error(),
        crate::capture_service::CaptureMode::AudioCheck.busy_error(),
        crate::context_import::to_app_error(
            crate::context_import::ERR_UNSUPPORTED_EXTENSION.to_string(),
        ),
        crate::context_import::to_app_error(crate::context_import::ERR_PDF_NO_TEXT.to_string()),
    ];
    for err in sites {
        let subject = err
            .params
            .get(param::SUBJECT)
            .unwrap_or_else(|| panic!("ошибка без subject: {err:?}"));
        assert!(
            subject::ALL.contains(&subject.as_str()),
            "необъявленный subject: {subject}"
        );
    }
}
