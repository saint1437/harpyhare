use futures_util::StreamExt;
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio_util::sync::CancellationToken;
use crate::sync::MutexExt;

use crate::http::{self, Retryable, RetryPolicy};

pub use crate::http::APP_USER_AGENT;

const ANTHROPIC_BASE_URL: &str = "https://api.anthropic.com";
const MESSAGES_PATH: &str = "/v1/messages";
const COUNT_TOKENS_PATH: &str = "/v1/messages/count_tokens";
const MODELS_PATH: &str = "/v1/models";
const MODELS_PAGE_LIMIT: u32 = 100;

const API_KEY_HEADER: &str = "x-api-key";
const VERSION_HEADER: &str = "anthropic-version";
const ANTHROPIC_VERSION: &str = "2023-06-01";

const MAX_TOKENS: u32 = 64000;

/// Whose key was refused. A proper noun: the same in both dictionaries, which is
/// why it travels as a parameter instead of being baked into two phrases.
const PROVIDER_NAME: &str = "Anthropic";

const THINKING_ADAPTIVE: &str = "adaptive";
const THINKING_DISABLED: &str = "disabled";

const WEB_SEARCH_TOOL_TYPE: &str = "web_search_20260209";
const WEB_SEARCH_TOOL_NAME: &str = "web_search";
const WEB_SEARCH_MAX_USES: u32 = 5;
const WEB_SEARCH_DIRECT_CALLERS: [&str; 1] = ["direct"];

const CACHE_TYPE_EPHEMERAL: &str = "ephemeral";

const HAIKU_PREFIX: &str = "claude-haiku";
const ALWAYS_THINKING_PREFIXES: [&str; 2] = ["claude-fable", "claude-mythos"];

const WARM_UP_TIMEOUT: Duration = Duration::from_secs(5);
const LIST_MODELS_TIMEOUT: Duration = Duration::from_secs(15);

/// The proxy worker rejects an oversized body with a bare 413, and the app had
/// no client-side ceiling at all — only `chat_images::IMAGE_MAX_BYTES` per
/// attachment, which says nothing about a message carrying several. Refusing
/// locally costs nothing and says what actually happened.
///
/// CROSS-REPO CONSTANT: this is the proxy worker's own body limit
/// (`itech-relay/src/config.ts`, `LLM_BODY_MAX_BYTES`). Matching it exactly is
/// the point — the refusal happens before the upload instead of after it. The
/// two repositories share no code and no CI, so changing one side without the
/// other silently turns a local error into a wasted upload and a bare 413.
///
/// `chat_images::IMAGE_MAX_BYTES` is sized so that one attachment, inflated by
/// base64, still fits underneath this with room for the history around it.
pub const MAX_REQUEST_BYTES: usize = 12 * 1024 * 1024;

const ERR_REQUEST_TOO_LARGE: &str =
    "Запрос слишком большой — удалите часть вложений или сократите контекст";

const BYTES_PER_MB: usize = 1024 * 1024;

/// Attempts and timing for the non-streaming calls. A stream is retried by
/// `LlmProvider::stream` itself and only before its first delta.
const REQUEST_RETRY: RetryPolicy =
    RetryPolicy::new(3, Duration::from_millis(400), Duration::from_secs(8));

const SSE_EVENT_SEPARATOR: &str = "\n\n";
const SSE_DATA_PREFIX: &str = "data: ";

const TRUNCATED_STREAM_ERROR: &str = "ответ оборван до завершения";
const UNKNOWN_API_ERROR: &str = "неизвестная ошибка API";

#[derive(Debug, thiserror::Error)]
pub enum LlmError {
    #[error("Неверный ключ Anthropic — проверь в настройках")]
    BadApiKey,
    /// The mirror of `SttError::BadAccessCode`. In proxy mode a 401/403 is the
    /// access code, not an API key — the access-code spec says so in as many
    /// words — but this side used to answer `Api(...)`, so the same rejection
    /// reached the UI under two different codes depending on which client hit
    /// it first, and neither of them was the one the form branches on.
    #[error("{0}")]
    BadAccessCode(String),
    #[error("{1}")]
    Retryable(u16, String),
    #[error("Нет соединения — проверь интернет/VPN: {0}")]
    Network(String),
    #[error("Ошибка API: {0}")]
    Api(String),
    #[error("Остановлено")]
    Cancelled,
    /// The local size refusal, which knows the ceiling it enforced.
    #[error("{0}")]
    TooLarge(String, usize),
    /// The proxy worker named the failure itself. Its code decides everything —
    /// which phrase the frontend picks and whether a retry is worth it — and
    /// its Russian sentence is kept only as the log line and the last resort.
    #[error("{0}")]
    Relay(RelayErrorText),
}

/// `thiserror`'s `{0}` needs something that prints; the payload is the parsed
/// worker error and printing it means printing its message.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RelayErrorText(pub crate::relay_error::RelayError);

impl std::fmt::Display for RelayErrorText {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0.message)
    }
}

impl LlmError {
    /// The wording used when the upstream gave no message of its own.
    pub fn retryable(status: u16) -> Self {
        LlmError::Retryable(status, format!("Anthropic перегружен, попробуй позже ({status})"))
    }

    pub fn relay(error: crate::relay_error::RelayError) -> Self {
        LlmError::Relay(RelayErrorText(error))
    }
}

impl crate::error::CodedError for LlmError {
    fn code(&self) -> crate::error::ErrorCode {
        use crate::error::ErrorCode;
        match self {
            LlmError::BadApiKey => ErrorCode::BadApiKey,
            LlmError::BadAccessCode(_) => ErrorCode::BadAccessCode,
            LlmError::Retryable(..) => ErrorCode::Retryable,
            LlmError::Network(_) => ErrorCode::Network,
            LlmError::Api(_) => ErrorCode::Api,
            LlmError::Cancelled => ErrorCode::Cancelled,
            LlmError::TooLarge(..) => ErrorCode::RequestTooLarge,
            LlmError::Relay(r) => r.0.code,
        }
    }

    fn params(&self) -> crate::error::ErrorParams {
        use crate::error::{param, params_of};
        match self {
            LlmError::Retryable(status, text) => params_of([
                (param::STATUS, status.to_string()),
                (param::DETAILS, text.clone()),
            ]),
            LlmError::Network(text) | LlmError::Api(text) | LlmError::BadAccessCode(text) => {
                params_of([(param::DETAILS, text.clone())])
            }
            LlmError::TooLarge(_, limit_mb) => {
                params_of([(param::LIMIT_MB, limit_mb.to_string())])
            }
            LlmError::Relay(r) => r.0.params.clone(),
            LlmError::BadApiKey => params_of([(param::PROVIDER, PROVIDER_NAME.to_string())]),
            LlmError::Cancelled => crate::error::ErrorParams::new(),
        }
    }
}

impl Retryable for LlmError {
    fn should_retry(&self) -> bool {
        match self {
            LlmError::Retryable(..) | LlmError::Network(_) => true,
            LlmError::Relay(r) => r.0.should_retry(),
            _ => false,
        }
    }
}

pub type ModelCatalog = Arc<Mutex<Vec<ModelInfo>>>;

#[derive(Debug, Clone, Default, PartialEq, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", default)]
pub struct RequestOptions {
    pub thinking: bool,
    pub web_search: bool,
}

#[derive(Debug, Clone)]
pub struct LlmRequest {
    pub model: String,
    pub system: String,
    pub messages: Vec<ChatMessage>,
    pub options: RequestOptions,
}

pub trait LlmStreamSink: Send {
    fn text_delta(&mut self, delta: &str);
    fn input_tokens(&mut self, total: u32);
}

#[async_trait::async_trait]
pub trait LlmProvider: Send + Sync {
    async fn stream(
        &self,
        request: LlmRequest,
        cancel: CancellationToken,
        sink: &mut dyn LlmStreamSink,
    ) -> Result<(), LlmError>;
    async fn count_tokens(&self, request: LlmRequest) -> Result<u32, LlmError>;
    async fn list_models(&self) -> Result<Vec<ModelInfo>, LlmError>;
    async fn reachable(&self) -> bool;
    async fn warm_up(&self);
}

#[derive(Clone)]
enum Auth {
    ApiKey(String),
    ProxyBearer(String),
}

#[derive(Clone)]
pub struct AnthropicClient {
    auth: Auth,
    base_url: String,
    client: reqwest::Client,
    catalog: ModelCatalog,
    retry: RetryPolicy,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    pub id: String,
    pub display_name: String,
    pub adaptive: bool,
    pub always_thinks: bool,
    pub code_exec: bool,
    pub max_input_tokens: u32,
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
        max_input_tokens: v["max_input_tokens"].as_u64().unwrap_or(0) as u32,
        id,
        display_name,
    })
}

pub fn fallback_models() -> Vec<ModelInfo> {
    [
        ("claude-opus-4-8", "Claude Opus 4.8", true),
        ("claude-sonnet-5", "Claude Sonnet 5", true),
        ("claude-haiku-4-5-20251001", "Claude Haiku 4.5", false),
    ]
    .into_iter()
    .map(|(id, name, caps)| ModelInfo {
        id: id.into(),
        display_name: name.into(),
        adaptive: caps,
        code_exec: caps,
        always_thinks: false,
        max_input_tokens: 0,
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

/// The body is read ONCE, before anything branches on the status: the worker's
/// `code` outranks the status everywhere it is present, and a `Response` can
/// only be consumed a single time.
async fn require_ok_status(resp: reqwest::Response, proxy: bool) -> Result<reqwest::Response, LlmError> {
    let status = resp.status().as_u16();
    if status == 200 {
        return Ok(resp);
    }
    let body = resp.text().await.unwrap_or_default();
    if proxy {
        if let Some(relay) = crate::relay_error::parse(&body) {
            return Err(LlmError::relay(relay));
        }
    }
    Err(match status {
        // No `code` in the body: either a direct Anthropic call or a worker
        // older than the coded protocol. Both keep the behaviour that was here.
        401 | 403 if proxy => LlmError::BadAccessCode(api_error_message(&body, status)),
        401 | 403 => LlmError::BadApiKey,
        // The worker answers an overload with a sentence of its own, in Russian.
        // Replacing it with "Anthropic перегружен" threw away the only thing
        // that told the user which side was unwell.
        429 | 500..=599 => {
            let upstream = if proxy { body_error_message(&body) } else { None };
            upstream.map_or_else(
                || LlmError::retryable(status),
                |m| LlmError::Retryable(status, m),
            )
        }
        _ => LlmError::Api(api_error_message(&body, status)),
    })
}

fn body_error_message(body: &str) -> Option<String> {
    serde_json::from_str::<Value>(body)
        .ok()?
        .get("error")?
        .get("message")?
        .as_str()
        .map(str::to_string)
        .filter(|m| !m.trim().is_empty())
}

/// A cheap upper bound on the serialized body: the base64 image payloads and the
/// text dominate it by orders of magnitude, and measuring them beats serializing
/// a 20 MB body twice just to learn it is too big.
pub fn request_size_bytes(request: &LlmRequest) -> usize {
    request.system.len()
        + request
            .messages
            .iter()
            .map(|m| {
                m.text.len()
                    + m.images
                        .iter()
                        .map(|i| i.data.len() + i.media_type.len())
                        .sum::<usize>()
            })
            .sum::<usize>()
}

fn require_sendable_size(request: &LlmRequest) -> Result<(), LlmError> {
    if request_size_bytes(request) > MAX_REQUEST_BYTES {
        return Err(LlmError::TooLarge(
            ERR_REQUEST_TOO_LARGE.into(),
            MAX_REQUEST_BYTES / BYTES_PER_MB,
        ));
    }
    Ok(())
}

const ERROR_BODY_SNIPPET_CHARS: usize = 120;

fn api_error_message(body: &str, code: u16) -> String {
    serde_json::from_str::<Value>(body)
        .ok()
        .and_then(|v| v["error"]["message"].as_str().map(str::to_string))
        .unwrap_or_else(|| {
            let snippet: String = body.trim().chars().take(ERROR_BODY_SNIPPET_CHARS).collect();
            if snippet.is_empty() {
                format!("HTTP {code}")
            } else {
                format!("HTTP {code}: {snippet}")
            }
        })
}

async fn pump_sse_stream(
    resp: reqwest::Response,
    cancel: &CancellationToken,
    sink: &mut dyn LlmStreamSink,
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
                SseOut::TextDelta(t) => sink.text_delta(&t),
                SseOut::InputTokens(n) => sink.input_tokens(n),
                SseOut::Done => return Ok(()),
                SseOut::ApiError(m) => return Err(LlmError::Api(m)),
            }
        }
    }
}

impl AnthropicClient {
    pub fn new(api_key: String) -> Self {
        Self {
            auth: Auth::ApiKey(api_key),
            base_url: ANTHROPIC_BASE_URL.into(),
            client: http::shared(),
            catalog: ModelCatalog::default(),
            retry: REQUEST_RETRY,
        }
    }
    pub fn for_proxy(access_token: String, base_url: String) -> Self {
        Self {
            auth: Auth::ProxyBearer(access_token),
            base_url,
            client: http::shared(),
            catalog: ModelCatalog::default(),
            retry: REQUEST_RETRY,
        }
    }
    /// Tests that assert a status mapping do not want three attempts of it.
    pub fn with_retry(mut self, retry: RetryPolicy) -> Self {
        self.retry = retry;
        self
    }
    pub fn with_catalog(mut self, catalog: ModelCatalog) -> Self {
        self.catalog = catalog;
        self
    }
    fn cached_model(&self, model_id: &str) -> Option<ModelInfo> {
        self.catalog
            .lock_safe()
            .iter()
            .find(|m| m.id == model_id)
            .cloned()
    }
    fn capability_fields(&self, request: &LlmRequest) -> (Option<Value>, Option<Value>) {
        let info = self.cached_model(&request.model);
        (
            thinking_value(info.as_ref(), &request.model, request.options.thinking),
            web_search_value(info.as_ref(), &request.model, request.options.web_search),
        )
    }
    fn is_proxy(&self) -> bool {
        matches!(self.auth, Auth::ProxyBearer(_))
    }
    fn authorize(&self, req: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        match &self.auth {
            Auth::ApiKey(key) => req.header(API_KEY_HEADER, key),
            Auth::ProxyBearer(token) => req.bearer_auth(token),
        }
    }
    pub fn with_base_url(mut self, url: String) -> Self {
        self.base_url = url;
        self
    }
    /// The one caller that needs a different read timeout has to own a client:
    /// reqwest has no per-request read timeout. Built from the shared factory,
    /// so the UA, pool and keep-alive settings stay single-sourced.
    pub fn with_read_timeout(mut self, d: Duration) -> Self {
        self.client = http::build_client(d);
        self
    }

    async fn fetch_models(&self) -> Result<Vec<ModelInfo>, LlmError> {
        let req = self
            .client
            .get(format!(
                "{}{MODELS_PATH}?limit={MODELS_PAGE_LIMIT}",
                self.base_url
            ))
            .header(VERSION_HEADER, ANTHROPIC_VERSION)
            .timeout(LIST_MODELS_TIMEOUT);
        let resp = self
            .authorize(req)
            .send()
            .await
            .map_err(|e| LlmError::Network(e.to_string()))?;
        let resp = require_ok_status(resp, self.is_proxy()).await?;
        let v: Value = resp
            .json()
            .await
            .map_err(|e| LlmError::Network(e.to_string()))?;
        Ok(v["data"]
            .as_array()
            .map(|arr| arr.iter().filter_map(model_info_from_json).collect())
            .unwrap_or_default())
    }

    fn messages_request(&self) -> reqwest::RequestBuilder {
        self.authorize(self.client.post(format!("{}{MESSAGES_PATH}", self.base_url)))
            .header(VERSION_HEADER, ANTHROPIC_VERSION)
    }

    async fn post_count_tokens(&self, body: Value) -> Result<u32, LlmError> {
        let resp = self
            .authorize(self.client.post(format!("{}{COUNT_TOKENS_PATH}", self.base_url)))
            .header(VERSION_HEADER, ANTHROPIC_VERSION)
            .json(&body)
            .send()
            .await
            .map_err(|e| LlmError::Network(e.to_string()))?;
        let resp = require_ok_status(resp, self.is_proxy()).await?;
        let v: Value = resp.json().await.map_err(|e| LlmError::Network(e.to_string()))?;
        v["input_tokens"]
            .as_u64()
            .map(|n| n as u32)
            .ok_or_else(|| LlmError::Api(UNKNOWN_API_ERROR.into()))
    }

    pub async fn stream_message(
        &self,
        body: serde_json::Value,
        cancel: CancellationToken,
        sink: &mut dyn LlmStreamSink,
    ) -> Result<(), LlmError> {
        let send = self.messages_request().json(&body).send();
        let resp = tokio::select! {
            r = send => r.map_err(|e| LlmError::Network(e.to_string()))?,
            _ = cancel.cancelled() => return Err(LlmError::Cancelled),
        };
        let resp = require_ok_status(resp, self.is_proxy()).await?;
        pump_sse_stream(resp, &cancel, sink).await
    }
}

/// A retry is only allowed while the user has seen nothing. Once a delta has
/// been forwarded, a second attempt would start the answer again on top of the
/// text already on screen — the reader would watch it stutter and the history
/// would keep both halves.
struct UntilFirstDelta<'a> {
    inner: &'a mut dyn LlmStreamSink,
    produced: bool,
}

impl LlmStreamSink for UntilFirstDelta<'_> {
    fn text_delta(&mut self, delta: &str) {
        self.produced = true;
        self.inner.text_delta(delta);
    }

    fn input_tokens(&mut self, total: u32) {
        self.inner.input_tokens(total);
    }
}

#[async_trait::async_trait]
impl LlmProvider for AnthropicClient {
    async fn stream(
        &self,
        request: LlmRequest,
        cancel: CancellationToken,
        sink: &mut dyn LlmStreamSink,
    ) -> Result<(), LlmError> {
        require_sendable_size(&request)?;
        let (thinking, web_search) = self.capability_fields(&request);
        let body = build_request_body(
            &request.model,
            &request.system,
            &request.messages,
            thinking,
            web_search,
        );
        let mut guarded = UntilFirstDelta {
            inner: sink,
            produced: false,
        };
        let mut attempt: u32 = 0;
        loop {
            let outcome = self
                .stream_message(body.clone(), cancel.clone(), &mut guarded)
                .await;
            let Err(e) = outcome else { return Ok(()) };
            attempt += 1;
            if guarded.produced
                || cancel.is_cancelled()
                || attempt >= self.retry.attempts
                || !e.should_retry()
            {
                return Err(e);
            }
            eprintln!("[llm] попытка {attempt} не удалась ({e}) — повтор");
            tokio::time::sleep(http::backoff_delay(self.retry, attempt - 1)).await;
        }
    }

    async fn count_tokens(&self, request: LlmRequest) -> Result<u32, LlmError> {
        require_sendable_size(&request)?;
        let (thinking, web_search) = self.capability_fields(&request);
        let body = build_count_tokens_body(
            &request.model,
            &request.system,
            &request.messages,
            thinking,
            web_search,
        );
        http::retry_with_backoff(self.retry, |_| self.post_count_tokens(body.clone())).await
    }

    async fn list_models(&self) -> Result<Vec<ModelInfo>, LlmError> {
        let models = http::retry_with_backoff(self.retry, |_| self.fetch_models()).await?;
        if !models.is_empty() {
            *self.catalog.lock_safe() = models.clone();
        }
        Ok(models)
    }

    async fn reachable(&self) -> bool {
        let req = self
            .client
            .get(format!("{}{MODELS_PATH}", self.base_url))
            .header(VERSION_HEADER, ANTHROPIC_VERSION)
            .timeout(WARM_UP_TIMEOUT);
        self.authorize(req).send().await.is_ok()
    }

    async fn warm_up(&self) {
        let _ = self
            .client
            .get(format!("{}{MODELS_PATH}", self.base_url))
            .timeout(WARM_UP_TIMEOUT)
            .send()
            .await;
    }
}

#[derive(Debug, Clone, Deserialize, specta::Type)]
pub struct ImageAttachment {
    pub media_type: String,
    pub data: String,
}

#[derive(Debug, Clone, Deserialize, specta::Type)]
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

pub fn build_count_tokens_body(
    model: &str,
    system: &str,
    messages: &[ChatMessage],
    thinking: Option<Value>,
    web_search: Option<Value>,
) -> Value {
    let mut body = build_request_body(model, system, messages, thinking, web_search);
    if let Some(o) = body.as_object_mut() {
        o.remove("max_tokens");
        o.remove("stream");
    }
    body
}

pub fn build_request_body(
    model: &str,
    system: &str,
    messages: &[ChatMessage],
    thinking: Option<Value>,
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
    if let Some(tool) = web_search {
        body["tools"] = json!([tool]);
    }
    body
}

#[derive(Debug, Clone, PartialEq)]
pub enum SseOut {
    TextDelta(String),
    InputTokens(u32),
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
                // `valid_up_to` guarantees this half is valid UTF-8; the fallback
                // is here so a future change to the slicing degrades to a dropped
                // chunk instead of killing the stream task.
                match std::str::from_utf8(&data[..valid]) {
                    Ok(s) => self.feed(s),
                    Err(_) => Vec::new(),
                }
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
            "message_start" => {
                let usage = &v["message"]["usage"];
                let total = usage["input_tokens"].as_u64().unwrap_or(0)
                    + usage["cache_read_input_tokens"].as_u64().unwrap_or(0)
                    + usage["cache_creation_input_tokens"].as_u64().unwrap_or(0);
                (total > 0).then_some(SseOut::InputTokens(total as u32))
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
mod tests;
