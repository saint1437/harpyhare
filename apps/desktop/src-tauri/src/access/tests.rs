use super::*;
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

#[tokio::test]
async fn redeem_returns_token_on_success() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path(REDEEM_PATH))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(serde_json::json!({"token": "itk_abc"})),
        )
        .mount(&server)
        .await;
    let token = redeem(&server.uri(), "CODE-1234", "idem-1").await.unwrap();
    assert_eq!(token, "itk_abc");
}

#[tokio::test]
async fn redeem_surfaces_proxy_error_message() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .respond_with(ResponseTemplate::new(404).set_body_json(serde_json::json!({
            "error": {"message": "Код недействителен или уже использован"}
        })))
        .mount(&server)
        .await;
    let err = redeem(&server.uri(), "BAD", "idem-2").await.unwrap_err();
    assert_eq!(err.code(), ErrorCode::BadAccessCode);
    assert_eq!(err.to_string(), "Код недействителен или уже использован");
}

#[tokio::test]
async fn redeem_rejects_empty_token() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({"token": ""})))
        .mount(&server)
        .await;
    let err = redeem(&server.uri(), "CODE", "idem-3").await.unwrap_err();
    assert_eq!(err.to_string(), REDEEM_EMPTY_TOKEN);
}

#[tokio::test]
async fn redeem_maps_unparseable_success_body() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .respond_with(ResponseTemplate::new(200).set_body_string("not json"))
        .mount(&server)
        .await;
    let err = redeem(&server.uri(), "CODE", "idem-4").await.unwrap_err();
    assert_eq!(err.to_string(), REDEEM_BAD_RESPONSE);
}

/// The bug this type exists for: «слишком много попыток» is not «код не принят».
#[test]
fn rate_limiting_and_upstream_failures_are_not_a_rejected_code() {
    assert_eq!(redeem_error(429, "").code(), ErrorCode::Retryable);
    assert_eq!(redeem_error(503, "").code(), ErrorCode::Retryable);
    assert_eq!(redeem_error(500, "").code(), ErrorCode::Retryable);
    assert_eq!(redeem_error(404, "").code(), ErrorCode::BadAccessCode);
    assert_eq!(redeem_error(409, "").code(), ErrorCode::BadAccessCode);
    assert_eq!(redeem_error(400, "").code(), ErrorCode::BadAccessCode);
}

#[test]
fn the_workers_own_wording_wins_over_the_bundled_text() {
    let body = r#"{"error":{"message":"Подождите час"}}"#;
    assert_eq!(redeem_error(429, body).to_string(), "Подождите час");
    assert_eq!(redeem_error(429, "").to_string(), REDEEM_TOO_MANY);
}

#[test]
fn only_transport_and_later_failures_are_retried() {
    assert!(AccessError::Network("x".into()).should_retry());
    assert!(AccessError::Retryable("x".into()).should_retry());
    assert!(!AccessError::Rejected("x".into()).should_retry());
    assert!(!AccessError::BadResponse("x".into()).should_retry());
}

/// `idempotency_key` is what makes retrying a redeem safe, so a 503 must be
/// retried rather than shown to the user as a dead code.
#[tokio::test]
async fn a_transient_upstream_failure_is_retried_and_can_succeed() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .respond_with(ResponseTemplate::new(503))
        .up_to_n_times(1)
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(serde_json::json!({"token": "itk_late"})),
        )
        .mount(&server)
        .await;
    assert_eq!(redeem(&server.uri(), "CODE", "idem-5").await.unwrap(), "itk_late");
}

#[tokio::test]
async fn a_rejected_code_is_not_retried() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .respond_with(ResponseTemplate::new(404))
        .expect(1)
        .mount(&server)
        .await;
    assert!(redeem(&server.uri(), "BAD", "idem-6").await.is_err());
}
