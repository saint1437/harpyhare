use super::*;
use wiremock::matchers::{header, method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

fn samples() -> Vec<f32> {
    vec![0.1f32; 16000]
}

struct BodyHas(&'static str);
impl wiremock::Match for BodyHas {
    fn matches(&self, request: &wiremock::Request) -> bool {
        String::from_utf8_lossy(&request.body).contains(self.0)
    }
}
struct BodyLacks(&'static str);
impl wiremock::Match for BodyLacks {
    fn matches(&self, request: &wiremock::Request) -> bool {
        !String::from_utf8_lossy(&request.body).contains(self.0)
    }
}

#[tokio::test]
async fn transcribe_returns_text_on_success() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path(TRANSCRIPTIONS_ENDPOINT))
        .and(header("authorization", "Bearer gsk_test"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({"text": "привет мир"})))
        .mount(&server)
        .await;
    let stt = GroqStt::new("gsk_test".into()).with_base_url(server.uri());
    assert_eq!(stt.transcribe(&samples()).await.unwrap(), "привет мир");
}

#[tokio::test]
async fn transcribe_sends_language_field_by_default() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path(TRANSCRIPTIONS_ENDPOINT))
        .and(BodyHas("language"))
        .and(BodyHas("whisper-large-v3-turbo"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({"text": "ок"})))
        .mount(&server)
        .await;
    let stt = GroqStt::new("k".into()).with_base_url(server.uri());
    assert_eq!(stt.transcribe(&samples()).await.unwrap(), "ок");
}

#[tokio::test]
async fn empty_language_means_autodetect_field_omitted() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path(TRANSCRIPTIONS_ENDPOINT))
        .and(BodyLacks("language"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({"text": "auto"})))
        .mount(&server)
        .await;
    let stt = GroqStt::new("k".into())
        .with_base_url(server.uri())
        .with_language(String::new());
    assert_eq!(stt.transcribe(&samples()).await.unwrap(), "auto");
}

#[tokio::test]
async fn translate_uses_translations_endpoint_and_large_v3() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path(TRANSLATIONS_ENDPOINT))
        .and(BodyHas("whisper-large-v3"))
        .and(BodyLacks("turbo"))
        .and(BodyLacks("language"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({"text": "hello"})))
        .mount(&server)
        .await;
    let stt = GroqStt::new("k".into())
        .with_base_url(server.uri())
        .with_translate(true);
    assert_eq!(stt.transcribe(&samples()).await.unwrap(), "hello");
}

#[tokio::test]
async fn transcribe_stream_sends_chunked_body_and_parses_text() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path(TRANSCRIPTIONS_ENDPOINT))
        .and(header("authorization", "Bearer gsk_test"))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(serde_json::json!({"text": " стрим ок "})),
        )
        .mount(&server)
        .await;
    let stt = GroqStt::new("gsk_test".into()).with_base_url(server.uri());

    let chunks: Vec<Result<Vec<u8>, std::io::Error>> = vec![
        Ok(crate::audio::wav_header_streaming().to_vec()),
        Ok(crate::audio::f32_to_i16le_bytes(&vec![0.1f32; 8000])),
        Ok(crate::audio::f32_to_i16le_bytes(&vec![0.2f32; 8000])),
    ];
    let body: AudioChunkStream = Box::pin(futures_util::stream::iter(chunks));
    let text = stt
        .transcribe_stream(body, tokio_util::sync::CancellationToken::new())
        .await
        .unwrap();
    assert_eq!(text, "стрим ок");
}

#[tokio::test]
async fn transcribe_stream_cancel_aborts() {
    use futures_util::StreamExt;
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({"text": "x"})))
        .mount(&server)
        .await;
    let stt = GroqStt::new("k".into()).with_base_url(server.uri());
    let endless =
        futures_util::stream::repeat_with(|| Ok::<Vec<u8>, std::io::Error>(vec![0u8; 512]))
            .then(|c| async {
                tokio::time::sleep(std::time::Duration::from_millis(5)).await;
                c
            });
    let cancel = tokio_util::sync::CancellationToken::new();
    let c2 = cancel.clone();
    tokio::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        c2.cancel();
    });
    let err = stt
        .transcribe_stream(Box::pin(endless), cancel)
        .await
        .unwrap_err();
    assert!(matches!(err, SttError::Other(m) if m.contains(CANCELLED_MESSAGE)));
}

#[tokio::test]
async fn transcribe_maps_401_to_bad_key() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .respond_with(ResponseTemplate::new(401))
        .mount(&server)
        .await;
    let stt = GroqStt::new("bad".into()).with_base_url(server.uri());
    assert!(matches!(stt.transcribe(&samples()).await, Err(SttError::BadApiKey)));
}

#[tokio::test]
async fn proxy_mode_401_maps_to_bad_access_code_with_body_message() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .respond_with(ResponseTemplate::new(401).set_body_json(serde_json::json!({
            "error": {"message": "Код доступа недействителен — введите новый в настройках"}
        })))
        .mount(&server)
        .await;
    let stt = GroqStt::new("itk_bad".into())
        .with_base_url(server.uri())
        .with_proxy(true);
    match stt.transcribe(&samples()).await {
        Err(SttError::BadAccessCode(m)) => assert!(m.contains("Код доступа недействителен")),
        other => panic!("ожидался BadAccessCode, получено: {other:?}"),
    }
}

#[tokio::test]
async fn transcribe_maps_429_and_5xx_to_retryable() {
    for code in [429u16, 500, 503] {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .respond_with(ResponseTemplate::new(code))
            .mount(&server)
            .await;
        let stt = GroqStt::new("k".into()).with_base_url(server.uri());
        assert!(matches!(stt.transcribe(&samples()).await, Err(SttError::Retryable(_))));
    }
}

#[tokio::test]
async fn transcribe_200_without_text_field_is_error() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({"unexpected": true})))
        .mount(&server)
        .await;
    let stt = GroqStt::new("k".into()).with_base_url(server.uri());
    assert!(matches!(stt.transcribe(&samples()).await, Err(SttError::Other(_))));
}

#[tokio::test]
async fn transcribe_maps_timeout_to_network() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .respond_with(ResponseTemplate::new(200).set_delay(std::time::Duration::from_secs(3)))
        .mount(&server)
        .await;
    let stt = GroqStt::new("k".into())
        .with_base_url(server.uri())
        .with_timeout(std::time::Duration::from_millis(200));
    assert!(matches!(stt.transcribe(&samples()).await, Err(SttError::Network(_))));
}
