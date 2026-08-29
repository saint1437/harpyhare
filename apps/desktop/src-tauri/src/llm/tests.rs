use super::*;
use serde_json::json;

fn adaptive() -> Option<Value> {
    Some(json!({"type": "adaptive"}))
}

/// `stream_message` takes the body already serialised — the retry loop in
/// `stream` encodes it once and clones the bytes, so the per-attempt deep copy
/// of the `Value` (and of every base64 image in it) is gone.
fn body_bytes(body: Value) -> Vec<u8> {
    serde_json::to_vec(&body).unwrap()
}

/// The owned mirror of `SseOut`. The parser hands out borrowed slices through a
/// callback now — no `Vec` per chunk and no `String` per delta — so the tests
/// that want to compare whole event lists copy them out here.
#[derive(Debug, PartialEq)]
enum Event {
    TextDelta(String),
    InputTokens(u32),
    Done,
    ApiError(String),
}

fn owned(out: SseOut<'_>) -> Event {
    match out {
        SseOut::TextDelta(t) => Event::TextDelta(t.to_string()),
        SseOut::InputTokens(n) => Event::InputTokens(n),
        SseOut::Done => Event::Done,
        SseOut::ApiError(m) => Event::ApiError(m.to_string()),
    }
}

fn feed(parser: &mut SseParser, chunk: &str) -> Vec<Event> {
    let mut events = Vec::new();
    parser.feed(chunk, &mut |e| events.push(owned(e)));
    events
}

fn feed_bytes(parser: &mut SseParser, chunk: &[u8]) -> Vec<Event> {
    let mut events = Vec::new();
    parser.feed_bytes(chunk, &mut |e| events.push(owned(e)));
    events
}

#[derive(Default)]
struct TestSink {
    text: String,
    input_tokens: Vec<u32>,
}

impl LlmStreamSink for TestSink {
    fn text_delta(&mut self, delta: &str) {
        self.text.push_str(delta);
    }
    fn input_tokens(&mut self, total: u32) {
        self.input_tokens.push(total);
    }
}

#[test]
fn thinking_value_semantics() {
    assert_eq!(
        thinking_value(None, "claude-opus-4-8", true),
        Some(json!({"type": "adaptive"}))
    );
    assert_eq!(
        thinking_value(None, "claude-opus-4-8", false),
        Some(json!({"type": "disabled"}))
    );
    assert_eq!(thinking_value(None, "claude-haiku-4-5", true), None);
    assert_eq!(thinking_value(None, "claude-haiku-4-5", false), None);
    assert_eq!(thinking_value(None, "claude-fable-5", true), None);
    assert_eq!(thinking_value(None, "claude-fable-5", false), None);
    let info = ModelInfo {
        id: "claude-newmodel-9".into(),
        display_name: "New".into(),
        adaptive: false,
        always_thinks: false,
        code_exec: true,
        max_input_tokens: 0,
    };
    assert_eq!(thinking_value(Some(&info), "claude-newmodel-9", true), None);
}

#[test]
fn model_info_parses_capabilities() {
    let v = json!({
        "id": "claude-haiku-4-5-20251001",
        "display_name": "Claude Haiku 4.5",
        "capabilities": {
            "thinking": {"supported": true, "types": {
                "enabled": {"supported": true}, "adaptive": {"supported": false}
            }},
            "code_execution": {"supported": false}
        }
    });
    let m = model_info_from_json(&v).unwrap();
    assert_eq!(m.display_name, "Claude Haiku 4.5");
    assert!(!m.adaptive);
    assert!(!m.always_thinks);
    assert!(!m.code_exec);
    let m = model_info_from_json(&json!({"id": "claude-sonnet-5"})).unwrap();
    assert!(m.adaptive);
    assert!(m.code_exec);
    assert_eq!(m.display_name, "claude-sonnet-5");
}

#[tokio::test]
async fn list_models_fetches_and_parses() {
    use wiremock::matchers::{header, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/v1/models"))
        .and(header("x-api-key", "sk-test"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "data": [
                {"id": "claude-sonnet-5", "display_name": "Claude Sonnet 5",
                 "capabilities": {"thinking": {"types": {"adaptive": {"supported": true}}}}},
                {"id": "claude-haiku-4-5-20251001", "display_name": "Claude Haiku 4.5",
                 "capabilities": {"thinking": {"types": {"adaptive": {"supported": false}}}}}
            ]
        })))
        .mount(&server)
        .await;
    let client = AnthropicClient::new("sk-test".into()).with_base_url(server.uri());
    let models = client.list_models().await.unwrap();
    assert_eq!(models.len(), 2);
    assert_eq!(models[0].id, "claude-sonnet-5");
    assert!(models[0].adaptive);
    assert!(!models[1].adaptive);
}

#[test]
fn text_only_content_is_plain_string() {
    assert_eq!(build_content("привет", &[], false), json!("привет"));
}

#[test]
fn images_go_before_text_as_blocks() {
    let imgs = vec![ImageAttachment {
        media_type: "image/png".into(),
        data: "AAAA".into(),
    }];
    assert_eq!(
        build_content("что на скриншоте?", &imgs, false),
        json!([
            {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": "AAAA"}},
            {"type": "text", "text": "что на скриншоте?"}
        ])
    );
}

#[test]
fn cache_breakpoint_lands_on_last_block() {
    let content = build_content("вопрос", &[], true);
    assert_eq!(
        content,
        json!([{"type": "text", "text": "вопрос", "cache_control": {"type": "ephemeral"}}])
    );
    let imgs = vec![ImageAttachment { media_type: "image/png".into(), data: "AAAA".into() }];
    let content = build_content("что тут?", &imgs, true);
    let arr = content.as_array().unwrap();
    assert!(arr[0].get("cache_control").is_none());
    assert_eq!(arr[1]["cache_control"]["type"], "ephemeral");
}

#[test]
fn request_body_shape_for_opus_includes_adaptive_thinking() {
    let msgs = vec![ChatMessage {
        role: "user".into(),
        text: "вопрос".into(),
        images: vec![],
    }];
    let body = build_request_body("claude-opus-4-8", "sys", &msgs, adaptive(), None);
    assert_eq!(body["model"], "claude-opus-4-8");
    assert_eq!(body["max_tokens"], 64000);
    assert_eq!(body["stream"], true);
    assert_eq!(body["thinking"]["type"], "adaptive");
    assert_eq!(body["system"][0]["text"], "sys");
    assert_eq!(body["system"][0]["cache_control"]["type"], "ephemeral");
    assert_eq!(body["messages"][0]["role"], "user");
    assert_eq!(body["messages"][0]["content"][0]["text"], "вопрос");
}

#[test]
fn request_body_preserves_multi_turn_history() {
    let msgs = vec![
        ChatMessage { role: "user".into(), text: "1+1?".into(), images: vec![] },
        ChatMessage { role: "assistant".into(), text: "2".into(), images: vec![] },
        ChatMessage { role: "user".into(), text: "а 2+2?".into(), images: vec![] },
    ];
    let body = build_request_body("claude-opus-4-8", "sys", &msgs, adaptive(), None);
    assert_eq!(body["messages"].as_array().unwrap().len(), 3);
    assert_eq!(body["messages"][1]["role"], "assistant");
    assert_eq!(body["messages"][1]["content"], "2");
    assert_eq!(body["messages"][2]["content"][0]["text"], "а 2+2?");
    assert_eq!(
        body["messages"][2]["content"][0]["cache_control"]["type"],
        "ephemeral"
    );
}

#[test]
fn thinking_none_omits_field_entirely() {
    let msgs = vec![ChatMessage { role: "user".into(), text: "q".into(), images: vec![] }];
    let body = build_request_body(
        "claude-haiku-4-5",
        "sys",
        &msgs,
        thinking_value(None, "claude-haiku-4-5", true),
        None,
    );
    assert!(body.get("thinking").is_none());
}

#[test]
fn thinking_off_sends_explicit_disabled() {
    let msgs = vec![ChatMessage { role: "user".into(), text: "q".into(), images: vec![] }];
    let body = build_request_body(
        "claude-opus-4-8",
        "sys",
        &msgs,
        thinking_value(None, "claude-opus-4-8", false),
        None,
    );
    assert_eq!(body["thinking"]["type"], "disabled");
}

#[test]
fn web_search_value_semantics() {
    assert_eq!(web_search_value(None, "claude-opus-4-8", false), None);
    assert_eq!(
        web_search_value(None, "claude-opus-4-8", true),
        Some(json!({"type": "web_search_20260209", "name": "web_search", "max_uses": 5}))
    );
    assert_eq!(
        web_search_value(None, "claude-haiku-4-5", true),
        Some(json!({
            "type": "web_search_20260209", "name": "web_search", "max_uses": 5,
            "allowed_callers": ["direct"]
        }))
    );
    let info = ModelInfo {
        id: "claude-newmodel-9".into(),
        display_name: "New".into(),
        adaptive: true,
        always_thinks: false,
        code_exec: false,
        max_input_tokens: 0,
    };
    let tool = web_search_value(Some(&info), "claude-newmodel-9", true).unwrap();
    assert_eq!(tool["allowed_callers"], json!(["direct"]));
}

#[test]
fn web_search_tool_lands_in_body_tools() {
    let msgs = vec![ChatMessage { role: "user".into(), text: "q".into(), images: vec![] }];
    let tool = web_search_value(None, "claude-opus-4-8", true);
    let body = build_request_body("claude-opus-4-8", "", &msgs, adaptive(), tool);
    assert_eq!(body["tools"][0]["type"], "web_search_20260209");
    assert_eq!(body["tools"][0]["name"], "web_search");
    assert_eq!(body["tools"][0]["max_uses"], 5);
    let body = build_request_body("claude-opus-4-8", "", &msgs, adaptive(), None);
    assert!(body.get("tools").is_none());
}

#[test]
fn empty_messages_are_dropped_from_history() {
    let msgs = vec![
        ChatMessage { role: "user".into(), text: "1+1?".into(), images: vec![] },
        ChatMessage { role: "assistant".into(), text: "".into(), images: vec![] },
        ChatMessage { role: "user".into(), text: "а 2+2?".into(), images: vec![] },
    ];
    let body = build_request_body("claude-opus-4-8", "s", &msgs, adaptive(), None);
    let arr = body["messages"].as_array().unwrap();
    assert_eq!(arr.len(), 2, "пустой assistant выброшен");
    assert_eq!(arr[0]["content"], "1+1?");
    assert_eq!(arr[1]["content"][0]["cache_control"]["type"], "ephemeral");
}

#[test]
fn empty_system_stays_plain_string() {
    let msgs = vec![ChatMessage { role: "user".into(), text: "q".into(), images: vec![] }];
    let body = build_request_body("claude-opus-4-8", "", &msgs, adaptive(), None);
    assert_eq!(body["system"], "");
}

const SSE_FIXTURE: &str = "event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"id\":\"msg_1\"}}\n\nevent: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}\n\nevent: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"При\"}}\n\nevent: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"thinking_delta\",\"thinking\":\"\"}}\n\nevent: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"вет!\"}}\n\nevent: message_stop\ndata: {\"type\":\"message_stop\"}\n\n";

#[test]
fn sse_parser_extracts_text_deltas_and_done() {
    let mut p = SseParser::new();
    let out = feed(&mut p, SSE_FIXTURE);
    let texts: Vec<_> = out
        .iter()
        .filter_map(|e| match e {
            Event::TextDelta(t) => Some(t.as_str()),
            _ => None,
        })
        .collect();
    assert_eq!(texts, vec!["При", "вет!"]);
    assert!(matches!(out.last(), Some(Event::Done)));
}

#[test]
fn sse_parser_handles_chunk_split_mid_event() {
    let mut p = SseParser::new();
    let (a, b) = SSE_FIXTURE.split_at(95);
    let mut out = feed(&mut p, a);
    out.extend(feed(&mut p, b));
    let text: String = out
        .iter()
        .filter_map(|e| match e {
            Event::TextDelta(t) => Some(t.clone()),
            _ => None,
        })
        .collect();
    assert_eq!(text, "Привет!");
}

#[test]
fn sse_parser_surfaces_api_error_event() {
    let mut p = SseParser::new();
    let out = feed(&mut p, "event: error\ndata: {\"type\":\"error\",\"error\":{\"type\":\"overloaded_error\",\"message\":\"Overloaded\"}}\n\n");
    assert!(matches!(&out[0], Event::ApiError(m) if m.contains("Overloaded")));
}

#[test]
fn empty_text_with_images_has_no_text_block() {
    let imgs = vec![ImageAttachment { media_type: "image/png".into(), data: "AAAA".into() }];
    let content = build_content("", &imgs, false);
    let arr = content.as_array().unwrap();
    assert_eq!(arr.len(), 1);
    assert_eq!(arr[0]["type"], "image");
}

#[test]
fn sse_message_start_usage_summed_with_cache() {
    let mut p = SseParser::new();
    let block = "event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"usage\":{\"input_tokens\":100,\"cache_read_input_tokens\":2000,\"cache_creation_input_tokens\":30}}}\n\n";
    assert_eq!(feed(&mut p, block), vec![Event::InputTokens(2130)]);
}

#[test]
fn sse_message_start_without_usage_ignored() {
    let mut p = SseParser::new();
    let block = "event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"id\":\"m\"}}\n\n";
    assert_eq!(feed(&mut p, block), vec![]);
}

#[test]
fn feed_bytes_handles_utf8_split_across_chunks() {
    let raw = "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"Привет\"}}\n\n";
    let bytes = raw.as_bytes();
    let cut = raw.find("Привет").unwrap() + 3;
    assert!(std::str::from_utf8(&bytes[..cut]).is_err(), "разрез должен попадать в середину символа");
    let mut p = SseParser::new();
    let mut out = feed_bytes(&mut p, &bytes[..cut]);
    out.extend(feed_bytes(&mut p, &bytes[cut..]));
    assert_eq!(out, vec![Event::TextDelta("Привет".to_string())]);
}

#[test]
fn sse_parser_handles_chunk_split_mid_data_json() {
    let raw = "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"hi\"}}\n\n";
    let mid = raw.find("text_delta").unwrap() + 5;
    let mut p = SseParser::new();
    let mut out = feed(&mut p, &raw[..mid]);
    out.extend(feed(&mut p, &raw[mid..]));
    assert_eq!(out, vec![Event::TextDelta("hi".to_string())]);
}

#[tokio::test]
async fn stream_collects_deltas_via_callback() {
    use wiremock::matchers::{header, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/v1/messages"))
        .and(header("x-api-key", "sk-test"))
        .and(header("anthropic-version", "2023-06-01"))
        // The body goes out as pre-serialised bytes now, so this header is set
        // by hand where `RequestBuilder::json` used to add it. Anthropic rejects
        // the request without it, and nothing else would notice it had gone.
        .and(header("content-type", "application/json"))
        .respond_with(
            ResponseTemplate::new(200)
                .insert_header("content-type", "text/event-stream")
                .set_body_raw(SSE_FIXTURE.as_bytes().to_vec(), "text/event-stream"),
        )
        .mount(&server)
        .await;

    let client = AnthropicClient::new("sk-test".into()).with_base_url(server.uri());
    let cancel = tokio_util::sync::CancellationToken::new();
    let msgs = vec![ChatMessage { role: "user".into(), text: "q".into(), images: vec![] }];
    let mut sink = TestSink::default();
    client
        .stream_message(
            body_bytes(build_request_body("claude-opus-4-8", "s", &msgs, adaptive(), None)),
            cancel,
            &mut sink,
        )
        .await
        .unwrap();
    assert_eq!(sink.text, "Привет!");
}

#[tokio::test]
async fn stream_times_out_on_silent_server() {
    use wiremock::matchers::method;
    use wiremock::{Mock, MockServer, ResponseTemplate};
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .respond_with(
            ResponseTemplate::new(200)
                .insert_header("content-type", "text/event-stream")
                .set_body_raw(SSE_FIXTURE.as_bytes().to_vec(), "text/event-stream")
                .set_delay(std::time::Duration::from_secs(10)),
        )
        .mount(&server)
        .await;
    let client = AnthropicClient::new("k".into())
        .with_base_url(server.uri())
        .with_read_timeout(std::time::Duration::from_millis(200));
    let msgs = vec![ChatMessage { role: "user".into(), text: "q".into(), images: vec![] }];
    let err = client
        .stream_message(
            body_bytes(build_request_body("claude-opus-4-8", "s", &msgs, adaptive(), None)),
            tokio_util::sync::CancellationToken::new(),
            &mut TestSink::default(),
        )
        .await
        .unwrap_err();
    assert!(matches!(err, LlmError::Network(_)), "got: {err:?}");
}

#[tokio::test]
async fn stream_eof_without_message_stop_is_error() {
    use wiremock::matchers::method;
    use wiremock::{Mock, MockServer, ResponseTemplate};
    let server = MockServer::start().await;
    let truncated = "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"При\"}}\n\n";
    Mock::given(method("POST"))
        .respond_with(
            ResponseTemplate::new(200)
                .insert_header("content-type", "text/event-stream")
                .set_body_raw(truncated.as_bytes().to_vec(), "text/event-stream"),
        )
        .mount(&server)
        .await;
    let client = AnthropicClient::new("k".into()).with_base_url(server.uri());
    let msgs = vec![ChatMessage { role: "user".into(), text: "q".into(), images: vec![] }];
    let mut sink = TestSink::default();
    let err = client
        .stream_message(
            body_bytes(build_request_body("claude-opus-4-8", "s", &msgs, adaptive(), None)),
            tokio_util::sync::CancellationToken::new(),
            &mut sink,
        )
        .await
        .unwrap_err();
    assert!(matches!(err, LlmError::Network(_)));
    assert_eq!(sink.text, "При");
}

#[tokio::test]
async fn stream_surfaces_api_error_message_from_body() {
    use wiremock::matchers::method;
    use wiremock::{Mock, MockServer, ResponseTemplate};
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .respond_with(ResponseTemplate::new(400).set_body_json(serde_json::json!({
            "type": "error",
            "error": {"type": "invalid_request_error", "message": "Your credit balance is too low"}
        })))
        .mount(&server)
        .await;
    let client = AnthropicClient::new("k".into()).with_base_url(server.uri());
    let msgs = vec![ChatMessage { role: "user".into(), text: "q".into(), images: vec![] }];
    let err = client
        .stream_message(
            body_bytes(build_request_body("claude-opus-4-8", "s", &msgs, adaptive(), None)),
            tokio_util::sync::CancellationToken::new(),
            &mut TestSink::default(),
        )
        .await
        .unwrap_err();
    assert!(
        matches!(&err, LlmError::Api(m) if m.contains("credit balance")),
        "got: {err:?}"
    );
}

#[tokio::test]
async fn stream_maps_401() {
    use wiremock::matchers::method;
    use wiremock::{Mock, MockServer, ResponseTemplate};
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .respond_with(ResponseTemplate::new(401))
        .mount(&server)
        .await;
    let client = AnthropicClient::new("bad".into()).with_base_url(server.uri());
    let msgs = vec![ChatMessage { role: "user".into(), text: "q".into(), images: vec![] }];
    let err = client
        .stream_message(
            body_bytes(build_request_body("claude-opus-4-8", "s", &msgs, adaptive(), None)),
            tokio_util::sync::CancellationToken::new(),
            &mut TestSink::default(),
        )
        .await
        .unwrap_err();
    assert!(matches!(err, LlmError::BadApiKey));
}

#[tokio::test]
async fn proxy_mode_authorizes_with_bearer_not_api_key() {
    use wiremock::matchers::{header, header_exists, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/v1/messages"))
        .and(header("authorization", "Bearer itk_token"))
        .respond_with(
            ResponseTemplate::new(200)
                .insert_header("content-type", "text/event-stream")
                .set_body_raw(SSE_FIXTURE.as_bytes().to_vec(), "text/event-stream"),
        )
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .and(header_exists("x-api-key"))
        .respond_with(ResponseTemplate::new(500))
        .mount(&server)
        .await;
    let client = llm_proxy_client("itk_token".into(), server.uri());
    let msgs = vec![ChatMessage { role: "user".into(), text: "q".into(), images: vec![] }];
    client
        .stream_message(
            body_bytes(build_request_body("claude-opus-4-8", "s", &msgs, adaptive(), None)),
            tokio_util::sync::CancellationToken::new(),
            &mut TestSink::default(),
        )
        .await
        .unwrap();
}

#[tokio::test]
async fn proxy_mode_401_is_a_bad_access_code_carrying_the_worker_message() {
    use wiremock::matchers::method;
    use wiremock::{Mock, MockServer, ResponseTemplate};
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .respond_with(ResponseTemplate::new(401).set_body_json(serde_json::json!({
            "error": {"message": "Код доступа недействителен — введите новый в настройках"}
        })))
        .mount(&server)
        .await;
    let client = llm_proxy_client("itk_bad".into(), server.uri());
    let msgs = vec![ChatMessage { role: "user".into(), text: "q".into(), images: vec![] }];
    let err = client
        .stream_message(
            body_bytes(build_request_body("claude-opus-4-8", "s", &msgs, adaptive(), None)),
            tokio_util::sync::CancellationToken::new(),
            &mut TestSink::default(),
        )
        .await
        .unwrap_err();
    // The spec (2026-07-09-access-codes-proxy-design.md) says 401/403 in proxy
    // mode means the access code, and `stt.rs` already answered that way. This
    // side used to answer `Api`, so the same rejection reached the UI under two
    // codes and the access-code form could not branch on it.
    assert!(
        matches!(&err, LlmError::BadAccessCode(m) if m.contains("Код доступа недействителен")),
        "got: {err:?}"
    );
    assert_eq!(
        crate::error::CodedError::code(&err),
        crate::error::ErrorCode::BadAccessCode
    );
}

fn llm_proxy_client(token: String, base: String) -> AnthropicClient {
    AnthropicClient::for_proxy(token, base)
}

#[tokio::test]
async fn stream_cancellation_stops_early() {
    use wiremock::matchers::method;
    use wiremock::{Mock, MockServer, ResponseTemplate};
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .respond_with(
            ResponseTemplate::new(200)
                .insert_header("content-type", "text/event-stream")
                .set_body_raw(SSE_FIXTURE.as_bytes().to_vec(), "text/event-stream")
                .set_delay(std::time::Duration::from_secs(5)),
        )
        .mount(&server)
        .await;
    let client = AnthropicClient::new("k".into()).with_base_url(server.uri());
    let cancel = tokio_util::sync::CancellationToken::new();
    cancel.cancel();
    let msgs = vec![ChatMessage { role: "user".into(), text: "q".into(), images: vec![] }];
    let err = client
        .stream_message(
            body_bytes(build_request_body("claude-opus-4-8", "s", &msgs, adaptive(), None)),
            cancel,
            &mut TestSink::default(),
        )
        .await
        .unwrap_err();
    assert!(matches!(err, LlmError::Cancelled));
}

// ---------- request size ceiling ----------

fn request_of(text: String, image_bytes: usize) -> LlmRequest {
    LlmRequest {
        model: "claude-haiku-4-5-20251001".into(),
        system: String::new(),
        messages: vec![ChatMessage {
            role: "user".into(),
            text,
            images: vec![ImageAttachment {
                media_type: "image/png".into(),
                data: "a".repeat(image_bytes),
            }],
        }],
        options: RequestOptions::default(),
    }
}

#[test]
fn the_request_size_counts_text_and_image_payloads() {
    let request = request_of("привет".into(), 1000);
    assert!(request_size_bytes(&request) >= 1000 + "привет".len());
}

#[tokio::test]
async fn an_oversized_request_is_refused_before_it_reaches_the_network() {
    let client = AnthropicClient::new("k".into()).with_base_url("http://127.0.0.1:1".into());
    let request = request_of(String::new(), MAX_REQUEST_BYTES + 1);
    let err = client
        .stream(
            request.clone(),
            tokio_util::sync::CancellationToken::new(),
            &mut TestSink::default(),
        )
        .await
        .unwrap_err();
    assert!(
        matches!(&err, LlmError::TooLarge(m, _) if m == ERR_REQUEST_TOO_LARGE),
        "got: {err:?}"
    );
    assert_eq!(
        crate::error::CodedError::code(&err),
        crate::error::ErrorCode::RequestTooLarge,
        "отказ по размеру — свой код, а не общая ошибка API"
    );
    assert_eq!(
        crate::error::CodedError::params(&err).get(crate::error::param::LIMIT_MB).map(String::as_str),
        Some("12"),
        "фронт печатает потолок из params, а не из русской фразы"
    );
    assert!(client.count_tokens(request).await.is_err());
}

#[tokio::test]
async fn a_request_within_the_ceiling_is_not_refused_locally() {
    use wiremock::matchers::method;
    use wiremock::{Mock, MockServer, ResponseTemplate};
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .respond_with(
            ResponseTemplate::new(200)
                .insert_header("content-type", "text/event-stream")
                .set_body_raw(SSE_FIXTURE.as_bytes().to_vec(), "text/event-stream"),
        )
        .mount(&server)
        .await;
    let client = AnthropicClient::new("k".into()).with_base_url(server.uri());
    let request = request_of("q".into(), 1024);
    assert!(client
        .stream(
            request,
            tokio_util::sync::CancellationToken::new(),
            &mut TestSink::default()
        )
        .await
        .is_ok());
}

// ---------- retries ----------

const NO_RETRY: crate::http::RetryPolicy = crate::http::RetryPolicy::new(
    1,
    std::time::Duration::from_millis(1),
    std::time::Duration::from_millis(1),
);

const TWO_FAST_TRIES: crate::http::RetryPolicy = crate::http::RetryPolicy::new(
    2,
    std::time::Duration::from_millis(1),
    std::time::Duration::from_millis(2),
);

#[tokio::test]
async fn a_503_before_the_first_delta_is_retried() {
    use wiremock::matchers::method;
    use wiremock::{Mock, MockServer, ResponseTemplate};
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .respond_with(ResponseTemplate::new(503))
        .up_to_n_times(1)
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .respond_with(
            ResponseTemplate::new(200)
                .insert_header("content-type", "text/event-stream")
                .set_body_raw(SSE_FIXTURE.as_bytes().to_vec(), "text/event-stream"),
        )
        .mount(&server)
        .await;
    let client = AnthropicClient::new("k".into())
        .with_base_url(server.uri())
        .with_retry(TWO_FAST_TRIES);
    let mut sink = TestSink::default();
    client
        .stream(
            request_of("q".into(), 0),
            tokio_util::sync::CancellationToken::new(),
            &mut sink,
        )
        .await
        .unwrap();
    assert!(!sink.text.is_empty(), "повтор довёл ответ до конца");
}

/// The invariant that makes retrying a stream safe at all: once the reader has
/// seen text, a second attempt would replay the answer on top of it.
#[tokio::test]
async fn a_stream_that_already_produced_text_is_not_retried() {
    use wiremock::matchers::method;
    use wiremock::{Mock, MockServer, ResponseTemplate};
    let truncated = "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"При\"}}\n\n";
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .respond_with(
            ResponseTemplate::new(200)
                .insert_header("content-type", "text/event-stream")
                .set_body_raw(truncated.as_bytes().to_vec(), "text/event-stream"),
        )
        // Exactly one request: a retry here would be the bug.
        .expect(1)
        .mount(&server)
        .await;
    let client = AnthropicClient::new("k".into())
        .with_base_url(server.uri())
        .with_retry(TWO_FAST_TRIES);
    let mut sink = TestSink::default();
    let err = client
        .stream(
            request_of("q".into(), 0),
            tokio_util::sync::CancellationToken::new(),
            &mut sink,
        )
        .await
        .unwrap_err();
    assert!(matches!(err, LlmError::Network(_)));
    assert_eq!(sink.text, "При", "текст остаётся ровно тем, что успело прийти");
}

#[tokio::test]
async fn a_rejected_request_is_not_retried() {
    use wiremock::matchers::method;
    use wiremock::{Mock, MockServer, ResponseTemplate};
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .respond_with(ResponseTemplate::new(400))
        .expect(1)
        .mount(&server)
        .await;
    let client = AnthropicClient::new("k".into())
        .with_base_url(server.uri())
        .with_retry(TWO_FAST_TRIES);
    assert!(client
        .stream(
            request_of("q".into(), 0),
            tokio_util::sync::CancellationToken::new(),
            &mut TestSink::default()
        )
        .await
        .is_err());
}

#[tokio::test]
async fn a_proxy_overload_carries_the_workers_own_message() {
    use wiremock::matchers::method;
    use wiremock::{Mock, MockServer, ResponseTemplate};
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .respond_with(ResponseTemplate::new(503).set_body_json(serde_json::json!({
            "error": {"message": "Сервер перегружен, попробуйте через минуту"}
        })))
        .mount(&server)
        .await;
    let client = AnthropicClient::for_proxy("itk".into(), server.uri()).with_retry(NO_RETRY);
    let err = client
        .stream(
            request_of("q".into(), 0),
            tokio_util::sync::CancellationToken::new(),
            &mut TestSink::default(),
        )
        .await
        .unwrap_err();
    assert_eq!(err.to_string(), "Сервер перегружен, попробуйте через минуту");
    assert_eq!(
        crate::error::CodedError::code(&err),
        crate::error::ErrorCode::Retryable
    );
}

#[tokio::test]
async fn a_direct_overload_keeps_the_bundled_wording() {
    use wiremock::matchers::method;
    use wiremock::{Mock, MockServer, ResponseTemplate};
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .respond_with(ResponseTemplate::new(429))
        .mount(&server)
        .await;
    let client = AnthropicClient::new("k".into())
        .with_base_url(server.uri())
        .with_retry(NO_RETRY);
    let err = client
        .stream(
            request_of("q".into(), 0),
            tokio_util::sync::CancellationToken::new(),
            &mut TestSink::default(),
        )
        .await
        .unwrap_err();
    assert!(err.to_string().contains("429"), "got: {err}");
}

/// `count_tokens` sends the same hand-set `content-type` and reads the figure
/// back. It is the second caller that stopped going through
/// `RequestBuilder::json`, and the only test that had touched it until now
/// asserted a refusal that never reaches the network.
#[tokio::test]
async fn count_tokens_posts_json_and_reads_the_figure() {
    use wiremock::matchers::{header, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/v1/messages/count_tokens"))
        .and(header("content-type", "application/json"))
        .and(header("anthropic-version", "2023-06-01"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "input_tokens": 4242
        })))
        .mount(&server)
        .await;
    let client = AnthropicClient::new("k".into()).with_base_url(server.uri());
    assert_eq!(
        client.count_tokens(request_of("q".into(), 0)).await.unwrap(),
        4242
    );
}

/// A retried `count_tokens` must send the body again, which is the whole reason
/// the encoded bytes are cloned per attempt rather than serialised once and
/// moved.
#[tokio::test]
async fn a_retried_count_tokens_sends_the_body_again() {
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/v1/messages/count_tokens"))
        .respond_with(ResponseTemplate::new(503))
        .up_to_n_times(1)
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .and(path("/v1/messages/count_tokens"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "input_tokens": 7
        })))
        .mount(&server)
        .await;
    let client = AnthropicClient::new("k".into())
        .with_base_url(server.uri())
        .with_retry(TWO_FAST_TRIES);
    assert_eq!(client.count_tokens(request_of("q".into(), 0)).await.unwrap(), 7);
}

/// The parser reports through a callback now, so `pump_sse_stream` cannot
/// `return` out of the middle of an event list the way the old `for` loop did —
/// it remembers the first terminal event instead. Anything the server put after
/// `message_stop` in the same chunk must still be dropped.
#[tokio::test]
async fn text_after_message_stop_in_the_same_chunk_is_ignored() {
    use wiremock::matchers::method;
    use wiremock::{Mock, MockServer, ResponseTemplate};
    let body = format!(
        "{SSE_FIXTURE}event: content_block_delta\ndata: {{\"type\":\"content_block_delta\",\"delta\":{{\"type\":\"text_delta\",\"text\":\"хвост\"}}}}\n\n"
    );
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .respond_with(
            ResponseTemplate::new(200)
                .insert_header("content-type", "text/event-stream")
                .set_body_raw(body.into_bytes(), "text/event-stream"),
        )
        .mount(&server)
        .await;
    let client = AnthropicClient::new("k".into()).with_base_url(server.uri());
    let mut sink = TestSink::default();
    client
        .stream(
            request_of("q".into(), 0),
            tokio_util::sync::CancellationToken::new(),
            &mut sink,
        )
        .await
        .unwrap();
    assert_eq!(sink.text, "Привет!");
}
