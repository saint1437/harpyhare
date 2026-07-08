use futures_util::StreamExt;
use serde::Deserialize;
use serde_json::{json, Value};
use std::time::Duration;
use tokio_util::sync::CancellationToken;

const ANTHROPIC_BASE_URL: &str = "https://api.anthropic.com";
const MESSAGES_PATH: &str = "/v1/messages";
const MODELS_PATH: &str = "/v1/models";
const MODELS_PAGE_LIMIT: u32 = 100;

const API_KEY_HEADER: &str = "x-api-key";
const VERSION_HEADER: &str = "anthropic-version";
const ANTHROPIC_VERSION: &str = "2023-06-01";
const BETA_HEADER: &str = "anthropic-beta";
const FAST_MODE_BETA: &str = "fast-mode-2026-02-01";

const MAX_TOKENS: u32 = 64000;
const SPEED_FIELD: &str = "speed";
const FAST_MODE_SPEED: &str = "fast";
const FAST_MODE_MODEL: &str = "claude-opus-4-8";

const THINKING_ADAPTIVE: &str = "adaptive";
const THINKING_DISABLED: &str = "disabled";

const WEB_SEARCH_TOOL_TYPE: &str = "web_search_20260209";
const WEB_SEARCH_TOOL_NAME: &str = "web_search";
const WEB_SEARCH_MAX_USES: u32 = 5;
const WEB_SEARCH_DIRECT_CALLERS: [&str; 1] = ["direct"];

const CACHE_TYPE_EPHEMERAL: &str = "ephemeral";

const HAIKU_PREFIX: &str = "claude-haiku";
const ALWAYS_THINKING_PREFIXES: [&str; 2] = ["claude-fable", "claude-mythos"];

const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const DEFAULT_READ_TIMEOUT: Duration = Duration::from_secs(60);
const HTTP2_KEEP_ALIVE_INTERVAL: Duration = Duration::from_secs(30);
const WARM_UP_TIMEOUT: Duration = Duration::from_secs(5);
const LIST_MODELS_TIMEOUT: Duration = Duration::from_secs(15);

const SSE_EVENT_SEPARATOR: &str = "\n\n";
const SSE_DATA_PREFIX: &str = "data: ";

const TRUNCATED_STREAM_ERROR: &str = "ответ оборван до завершения";
const UNKNOWN_API_ERROR: &str = "неизвестная ошибка API";

#[derive(Debug, thiserror::Error)]
pub enum LlmError {
    #[error("Неверный ключ Anthropic — проверь в настройках")]
    BadApiKey,
    #[error("Anthropic перегружен, попробуй позже ({0})")]
    Retryable(u16),
    #[error("Нет соединения — проверь интернет/VPN: {0}")]
    Network(String),
    #[error("Ошибка API: {0}")]
    Api(String),
    #[error("Остановлено")]
    Cancelled,
}

#[derive(Clone)]
pub struct AnthropicClient {
    api_key: String,
    base_url: String,
    client: reqwest::Client,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    pub id: String,
    pub display_name: String,
    pub adaptive: bool,
    pub always_thinks: bool,
    pub code_exec: bool,
}

fn fallback_adaptive(id: &str) -> bool {
    !id.starts_with(HAIKU_PREFIX)
}

fn fallback_code_exec(id: &str) -> bool {
    !id.starts_with(HAIKU_PREFIX)
}

fn always_thinks(id: &str) -> bool {
    ALWAYS_THINKING_PREFIXES.iter().any(|p| id.starts_with(p))
}

fn model_info_from_json(v: &Value) -> Option<ModelInfo> {
    let id = v["id"].as_str()?.to_string();
    let display_name = v["display_name"].as_str().unwrap_or(&id).to_string();
    let adaptive = v["capabilities"]["thinking"]["types"]["adaptive"]["supported"]
        .as_bool()
        .unwrap_or_else(|| fallback_adaptive(&id));
    let code_exec = v["capabilities"]["code_execution"]["supported"]
        .as_bool()
        .unwrap_or_else(|| fallback_code_exec(&id));
    Some(ModelInfo {
        always_thinks: always_thinks(&id),
        adaptive,
        code_exec,
        id,
        display_name,
    })
}

pub fn fallback_models() -> Vec<ModelInfo> {
    [
        ("claude-opus-4-8", "Claude Opus 4.8", true),
        ("claude-sonnet-4-6", "Claude Sonnet 4.6", true),
        ("claude-haiku-4-5", "Claude Haiku 4.5", false),
    ]
    .into_iter()
    .map(|(id, name, caps)| ModelInfo {
        id: id.into(),
        display_name: name.into(),
        adaptive: caps,
        code_exec: caps,
        always_thinks: false,
    })
    .collect()
}

pub fn thinking_value(info: Option<&ModelInfo>, model_id: &str, requested: bool) -> Option<Value> {
    let adaptive = info.map_or_else(|| fallback_adaptive(model_id), |m| m.adaptive);
    let always = info.map_or_else(|| always_thinks(model_id), |m| m.always_thinks);
    if always {
        return None;
    }
    if requested {
        adaptive.then(|| json!({"type": THINKING_ADAPTIVE}))
    } else if adaptive {
        Some(json!({"type": THINKING_DISABLED}))
    } else {
        None
    }
}

pub fn web_search_value(info: Option<&ModelInfo>, model_id: &str, requested: bool) -> Option<Value> {
    if !requested {
        return None;
    }
    let code_exec = info.map_or_else(|| fallback_code_exec(model_id), |m| m.code_exec);
    let mut tool = json!({
        "type": WEB_SEARCH_TOOL_TYPE,
        "name": WEB_SEARCH_TOOL_NAME,
        "max_uses": WEB_SEARCH_MAX_USES
    });
    if !code_exec {
        tool["allowed_callers"] = json!(WEB_SEARCH_DIRECT_CALLERS);
    }
    Some(tool)
}

fn build_http_client(read_timeout: Duration) -> reqwest::Client {
    reqwest::Client::builder()
        .connect_timeout(CONNECT_TIMEOUT)
        .read_timeout(read_timeout)
        .pool_idle_timeout(None)
        .http2_keep_alive_interval(HTTP2_KEEP_ALIVE_INTERVAL)
        .http2_keep_alive_while_idle(true)
        .build()
        .expect("reqwest client")
}

async fn require_ok_status(resp: reqwest::Response) -> Result<reqwest::Response, LlmError> {
    match resp.status().as_u16() {
        200 => Ok(resp),
        401 | 403 => Err(LlmError::BadApiKey),
        code @ (429 | 500..=599) => Err(LlmError::Retryable(code)),
        code => Err(LlmError::Api(api_error_message(resp, code).await)),
    }
}

async fn api_error_message(resp: reqwest::Response, code: u16) -> String {
    let body = resp.text().await.unwrap_or_default();
    serde_json::from_str::<Value>(&body)
        .ok()
        .and_then(|v| v["error"]["message"].as_str().map(str::to_string))
        .unwrap_or_else(|| format!("HTTP {code}"))
}

async fn pump_sse_stream(
    resp: reqwest::Response,
    cancel: &CancellationToken,
    on_delta: &mut impl FnMut(&str),
) -> Result<(), LlmError> {
    let mut parser = SseParser::new();
    let mut stream = resp.bytes_stream();
    loop {
        let chunk = tokio::select! {
            c = stream.next() => c,
            _ = cancel.cancelled() => return Err(LlmError::Cancelled),
        };
        let Some(chunk) = chunk else {
            return Err(LlmError::Network(TRUNCATED_STREAM_ERROR.into()));
        };
        let bytes = chunk.map_err(|e| LlmError::Network(e.to_string()))?;
        for out in parser.feed_bytes(&bytes) {
            match out {
                SseOut::TextDelta(t) => on_delta(&t),
                SseOut::Done => return Ok(()),
                SseOut::ApiError(m) => return Err(LlmError::Api(m)),
            }
        }
    }
}

impl AnthropicClient {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            base_url: ANTHROPIC_BASE_URL.into(),
            client: build_http_client(DEFAULT_READ_TIMEOUT),
        }
    }
    pub fn with_base_url(mut self, url: String) -> Self {
        self.base_url = url;
        self
    }
    pub fn with_read_timeout(mut self, d: Duration) -> Self {
        self.client = build_http_client(d);
        self
    }

    pub async fn warm_up(&self) {
        let _ = self
            .client
            .get(format!("{}{MODELS_PATH}", self.base_url))
            .timeout(WARM_UP_TIMEOUT)
            .send()
            .await;
    }

    pub async fn list_models(&self) -> Result<Vec<ModelInfo>, LlmError> {
        let resp = self
            .client
            .get(format!(
                "{}{MODELS_PATH}?limit={MODELS_PAGE_LIMIT}",
                self.base_url
            ))
            .header(API_KEY_HEADER, &self.api_key)
            .header(VERSION_HEADER, ANTHROPIC_VERSION)
            .timeout(LIST_MODELS_TIMEOUT)
            .send()
            .await
            .map_err(|e| LlmError::Network(e.to_string()))?;
        if resp.status().as_u16() != 200 {
            return Err(LlmError::Api(format!("models HTTP {}", resp.status().as_u16())));
        }
        let v: Value = resp
            .json()
            .await
            .map_err(|e| LlmError::Network(e.to_string()))?;
        Ok(v["data"]
            .as_array()
            .map(|arr| arr.iter().filter_map(model_info_from_json).collect())
            .unwrap_or_default())
    }

    fn messages_request(&self, body: &Value) -> reqwest::RequestBuilder {
        let mut req = self
            .client
            .post(format!("{}{MESSAGES_PATH}", self.base_url))
            .header(API_KEY_HEADER, &self.api_key)
            .header(VERSION_HEADER, ANTHROPIC_VERSION);
        if body.get(SPEED_FIELD).is_some() {
            req = req.header(BETA_HEADER, FAST_MODE_BETA);
        }
        req
    }

    pub async fn stream_message(
        &self,
        body: serde_json::Value,
        cancel: CancellationToken,
        mut on_delta: impl FnMut(&str),
    ) -> Result<(), LlmError> {
        let send = self.messages_request(&body).json(&body).send();
        let resp = tokio::select! {
            r = send => r.map_err(|e| LlmError::Network(e.to_string()))?,
            _ = cancel.cancelled() => return Err(LlmError::Cancelled),
        };
        let resp = require_ok_status(resp).await?;
        pump_sse_stream(resp, &cancel, &mut on_delta).await
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct ImageAttachment {
    pub media_type: String,
    pub data: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub text: String,
    #[serde(default)]
    pub images: Vec<ImageAttachment>,
}

fn ephemeral_cache_control() -> Value {
    json!({"type": CACHE_TYPE_EPHEMERAL})
}

fn image_block(img: &ImageAttachment) -> Value {
    json!({
        "type": "image",
        "source": {"type": "base64", "media_type": img.media_type, "data": img.data}
    })
}

pub fn build_content(text: &str, images: &[ImageAttachment], cache_breakpoint: bool) -> Value {
    if images.is_empty() && !cache_breakpoint {
        return json!(text);
    }
    let mut blocks: Vec<Value> = images.iter().map(image_block).collect();
    if !text.is_empty() {
        blocks.push(json!({"type": "text", "text": text}));
    }
    if blocks.is_empty() {
        return json!(text);
    }
    if cache_breakpoint {
        if let Some(last) = blocks.last_mut() {
            last["cache_control"] = ephemeral_cache_control();
        }
    }
    Value::Array(blocks)
}

fn history_messages_json(messages: &[ChatMessage]) -> Vec<Value> {
    let kept: Vec<&ChatMessage> = messages
        .iter()
        .filter(|m| !m.text.is_empty() || !m.images.is_empty())
        .collect();
    let last = kept.len().saturating_sub(1);
    kept.iter()
        .enumerate()
        .map(|(i, m)| json!({"role": m.role, "content": build_content(&m.text, &m.images, i == last)}))
        .collect()
}

fn system_json(system: &str) -> Value {
    if system.is_empty() {
        json!("")
    } else {
        json!([{"type": "text", "text": system, "cache_control": ephemeral_cache_control()}])
    }
}

pub fn build_request_body(
    model: &str,
    system: &str,
    messages: &[ChatMessage],
    thinking: Option<Value>,
    fast: bool,
    web_search: Option<Value>,
) -> Value {
    let mut body = json!({
        "model": model,
        "max_tokens": MAX_TOKENS,
        "stream": true,
        "system": system_json(system),
        "messages": history_messages_json(messages)
    });
    if let Some(t) = thinking {
        body["thinking"] = t;
    }
    if fast && model == FAST_MODE_MODEL {
        body[SPEED_FIELD] = json!(FAST_MODE_SPEED);
    }
    if let Some(tool) = web_search {
        body["tools"] = json!([tool]);
    }
    body
}

#[derive(Debug, Clone, PartialEq)]
pub enum SseOut {
    TextDelta(String),
    Done,
    ApiError(String),
}

#[derive(Default)]
pub struct SseParser {
    buf: String,
    tail: Vec<u8>,
}

impl SseParser {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn feed(&mut self, chunk: &str) -> Vec<SseOut> {
        self.buf.push_str(chunk);
        let mut out = Vec::new();
        let mut start = 0;
        while let Some(rel) = self.buf[start..].find(SSE_EVENT_SEPARATOR) {
            let pos = start + rel;
            if let Some(parsed) = Self::parse_block(&self.buf[start..pos]) {
                out.push(parsed);
            }
            start = pos + SSE_EVENT_SEPARATOR.len();
        }
        self.buf.drain(..start);
        out
    }

    pub fn feed_bytes(&mut self, chunk: &[u8]) -> Vec<SseOut> {
        let data = if self.tail.is_empty() {
            chunk.to_vec()
        } else {
            let mut v = std::mem::take(&mut self.tail);
            v.extend_from_slice(chunk);
            v
        };
        match std::str::from_utf8(&data) {
            Ok(s) => self.feed(s),
            Err(e) => {
                let valid = e.valid_up_to();
                self.tail = data[valid..].to_vec();
                let s = std::str::from_utf8(&data[..valid]).expect("проверено valid_up_to");
                self.feed(s)
            }
        }
    }

    fn parse_block(block: &str) -> Option<SseOut> {
        let data_line = block.lines().find(|l| l.starts_with(SSE_DATA_PREFIX))?;
        let v: serde_json::Value = serde_json::from_str(&data_line[SSE_DATA_PREFIX.len()..]).ok()?;
        match v["type"].as_str()? {
            "content_block_delta" if v["delta"]["type"] == "text_delta" => {
                Some(SseOut::TextDelta(v["delta"]["text"].as_str()?.to_string()))
            }
            "message_stop" => Some(SseOut::Done),
            "error" => Some(SseOut::ApiError(
                v["error"]["message"].as_str().unwrap_or(UNKNOWN_API_ERROR).to_string(),
            )),
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn adaptive() -> Option<Value> {
        Some(json!({"type": "adaptive"}))
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
        let body = build_request_body("claude-opus-4-8", "sys", &msgs, adaptive(), false, None);
        assert_eq!(body["model"], "claude-opus-4-8");
        assert_eq!(body["max_tokens"], 64000);
        assert_eq!(body["stream"], true);
        assert_eq!(body["thinking"]["type"], "adaptive");
        assert_eq!(body["system"][0]["text"], "sys");
        assert_eq!(body["system"][0]["cache_control"]["type"], "ephemeral");
        assert_eq!(body["messages"][0]["role"], "user");
        assert_eq!(body["messages"][0]["content"][0]["text"], "вопрос");
        assert!(body.get("speed").is_none());
    }

    #[test]
    fn request_body_preserves_multi_turn_history() {
        let msgs = vec![
            ChatMessage { role: "user".into(), text: "1+1?".into(), images: vec![] },
            ChatMessage { role: "assistant".into(), text: "2".into(), images: vec![] },
            ChatMessage { role: "user".into(), text: "а 2+2?".into(), images: vec![] },
        ];
        let body = build_request_body("claude-opus-4-8", "sys", &msgs, adaptive(), false, None);
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
            false,
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
            false,
            None,
        );
        assert_eq!(body["thinking"]["type"], "disabled");
    }

    #[test]
    fn fast_mode_only_for_opus_4_8() {
        let msgs = vec![ChatMessage { role: "user".into(), text: "q".into(), images: vec![] }];
        let body = build_request_body("claude-opus-4-8", "", &msgs, adaptive(), true, None);
        assert_eq!(body["speed"], "fast");
        let body = build_request_body("claude-sonnet-4-6", "", &msgs, adaptive(), true, None);
        assert!(body.get("speed").is_none());
        let body = build_request_body("claude-haiku-4-5", "", &msgs, adaptive(), true, None);
        assert!(body.get("speed").is_none());
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
        };
        let tool = web_search_value(Some(&info), "claude-newmodel-9", true).unwrap();
        assert_eq!(tool["allowed_callers"], json!(["direct"]));
    }

    #[test]
    fn web_search_tool_lands_in_body_tools() {
        let msgs = vec![ChatMessage { role: "user".into(), text: "q".into(), images: vec![] }];
        let tool = web_search_value(None, "claude-opus-4-8", true);
        let body = build_request_body("claude-opus-4-8", "", &msgs, adaptive(), false, tool);
        assert_eq!(body["tools"][0]["type"], "web_search_20260209");
        assert_eq!(body["tools"][0]["name"], "web_search");
        assert_eq!(body["tools"][0]["max_uses"], 5);
        let body = build_request_body("claude-opus-4-8", "", &msgs, adaptive(), false, None);
        assert!(body.get("tools").is_none());
    }

    #[test]
    fn empty_messages_are_dropped_from_history() {
        let msgs = vec![
            ChatMessage { role: "user".into(), text: "1+1?".into(), images: vec![] },
            ChatMessage { role: "assistant".into(), text: "".into(), images: vec![] },
            ChatMessage { role: "user".into(), text: "а 2+2?".into(), images: vec![] },
        ];
        let body = build_request_body("claude-opus-4-8", "s", &msgs, adaptive(), false, None);
        let arr = body["messages"].as_array().unwrap();
        assert_eq!(arr.len(), 2, "пустой assistant выброшен");
        assert_eq!(arr[0]["content"], "1+1?");
        assert_eq!(arr[1]["content"][0]["cache_control"]["type"], "ephemeral");
    }

    #[test]
    fn empty_system_stays_plain_string() {
        let msgs = vec![ChatMessage { role: "user".into(), text: "q".into(), images: vec![] }];
        let body = build_request_body("claude-opus-4-8", "", &msgs, adaptive(), false, None);
        assert_eq!(body["system"], "");
    }

    const SSE_FIXTURE: &str = "event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"id\":\"msg_1\"}}\n\nevent: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}\n\nevent: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"При\"}}\n\nevent: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"thinking_delta\",\"thinking\":\"\"}}\n\nevent: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"вет!\"}}\n\nevent: message_stop\ndata: {\"type\":\"message_stop\"}\n\n";

    #[test]
    fn sse_parser_extracts_text_deltas_and_done() {
        let mut p = SseParser::new();
        let out = p.feed(SSE_FIXTURE);
        let texts: Vec<_> = out
            .iter()
            .filter_map(|e| match e {
                SseOut::TextDelta(t) => Some(t.as_str()),
                _ => None,
            })
            .collect();
        assert_eq!(texts, vec!["При", "вет!"]);
        assert!(matches!(out.last(), Some(SseOut::Done)));
    }

    #[test]
    fn sse_parser_handles_chunk_split_mid_event() {
        let mut p = SseParser::new();
        let (a, b) = SSE_FIXTURE.split_at(95);
        let mut out = p.feed(a);
        out.extend(p.feed(b));
        let text: String = out
            .iter()
            .filter_map(|e| match e {
                SseOut::TextDelta(t) => Some(t.clone()),
                _ => None,
            })
            .collect();
        assert_eq!(text, "Привет!");
    }

    #[test]
    fn sse_parser_surfaces_api_error_event() {
        let mut p = SseParser::new();
        let out = p.feed("event: error\ndata: {\"type\":\"error\",\"error\":{\"type\":\"overloaded_error\",\"message\":\"Overloaded\"}}\n\n");
        assert!(matches!(&out[0], SseOut::ApiError(m) if m.contains("Overloaded")));
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
    fn feed_bytes_handles_utf8_split_across_chunks() {
        let raw = "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"Привет\"}}\n\n";
        let bytes = raw.as_bytes();
        let cut = raw.find("Привет").unwrap() + 3;
        assert!(std::str::from_utf8(&bytes[..cut]).is_err(), "разрез должен попадать в середину символа");
        let mut p = SseParser::new();
        let mut out = p.feed_bytes(&bytes[..cut]);
        out.extend(p.feed_bytes(&bytes[cut..]));
        assert_eq!(out, vec![SseOut::TextDelta("Привет".to_string())]);
    }

    #[test]
    fn sse_parser_handles_chunk_split_mid_data_json() {
        let raw = "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"hi\"}}\n\n";
        let mid = raw.find("text_delta").unwrap() + 5;
        let mut p = SseParser::new();
        let mut out = p.feed(&raw[..mid]);
        out.extend(p.feed(&raw[mid..]));
        assert_eq!(out, vec![SseOut::TextDelta("hi".to_string())]);
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
            .respond_with(
                ResponseTemplate::new(200)
                    .insert_header("content-type", "text/event-stream")
                    .set_body_raw(SSE_FIXTURE.as_bytes().to_vec(), "text/event-stream"),
            )
            .mount(&server)
            .await;

        let client = AnthropicClient::new("sk-test".into()).with_base_url(server.uri());
        let collected = std::sync::Arc::new(std::sync::Mutex::new(String::new()));
        let c2 = collected.clone();
        let cancel = tokio_util::sync::CancellationToken::new();
        let msgs = vec![ChatMessage { role: "user".into(), text: "q".into(), images: vec![] }];
        client
            .stream_message(
                build_request_body("claude-opus-4-8", "s", &msgs, adaptive(), false, None),
                cancel,
                move |delta| c2.lock().unwrap().push_str(delta),
            )
            .await
            .unwrap();
        assert_eq!(*collected.lock().unwrap(), "Привет!");
    }

    #[tokio::test]
    async fn fast_mode_sends_beta_header() {
        use wiremock::matchers::{header, method};
        use wiremock::{Mock, MockServer, ResponseTemplate};
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(header("anthropic-beta", "fast-mode-2026-02-01"))
            .respond_with(
                ResponseTemplate::new(200)
                    .insert_header("content-type", "text/event-stream")
                    .set_body_raw(SSE_FIXTURE.as_bytes().to_vec(), "text/event-stream"),
            )
            .mount(&server)
            .await;
        let client = AnthropicClient::new("k".into()).with_base_url(server.uri());
        let msgs = vec![ChatMessage { role: "user".into(), text: "q".into(), images: vec![] }];
        client
            .stream_message(
                build_request_body("claude-opus-4-8", "s", &msgs, adaptive(), true, None),
                tokio_util::sync::CancellationToken::new(),
                |_| {},
            )
            .await
            .unwrap();
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
                build_request_body("claude-opus-4-8", "s", &msgs, adaptive(), false, None),
                tokio_util::sync::CancellationToken::new(),
                |_| {},
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
        let collected = std::sync::Arc::new(std::sync::Mutex::new(String::new()));
        let c2 = collected.clone();
        let msgs = vec![ChatMessage { role: "user".into(), text: "q".into(), images: vec![] }];
        let err = client
            .stream_message(
                build_request_body("claude-opus-4-8", "s", &msgs, adaptive(), false, None),
                tokio_util::sync::CancellationToken::new(),
                move |d| c2.lock().unwrap().push_str(d),
            )
            .await
            .unwrap_err();
        assert!(matches!(err, LlmError::Network(_)));
        assert_eq!(*collected.lock().unwrap(), "При");
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
                build_request_body("claude-opus-4-8", "s", &msgs, adaptive(), false, None),
                tokio_util::sync::CancellationToken::new(),
                |_| {},
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
                build_request_body("claude-opus-4-8", "s", &msgs, adaptive(), false, None),
                tokio_util::sync::CancellationToken::new(),
                |_| {},
            )
            .await
            .unwrap_err();
        assert!(matches!(err, LlmError::BadApiKey));
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
                build_request_body("claude-opus-4-8", "s", &msgs, adaptive(), false, None),
                cancel,
                |_| {},
            )
            .await
            .unwrap_err();
        assert!(matches!(err, LlmError::Cancelled));
    }
}
