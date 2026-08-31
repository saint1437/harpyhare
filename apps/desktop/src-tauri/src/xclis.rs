use futures_util::StreamExt;
use reqwest::header::{ACCEPT, CONTENT_TYPE};
use serde_json::{json, Value};
use std::error::Error;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio_util::sync::CancellationToken;

use crate::llm::{
    ChatMessage, LlmError, LlmProvider, LlmRequest, LlmStreamSink, ModelCatalog, ModelInfo,
    APP_USER_AGENT,
};

const CHAT_COMPLETIONS_PATH: &str = "/v1/chat/completions";
const MODELS_PATH: &str = "/v1/models";
const COUNT_TOKENS_PATH: &str = "/v1/messages/count_tokens";
const ANTHROPIC_VERSION: &str = "2023-06-01";
const MAX_TOKENS: u32 = 32768;
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const STREAM_IDLE_TIMEOUT: Duration = Duration::from_secs(5 * 60);
const HTTP2_KEEP_ALIVE_INTERVAL: Duration = Duration::from_secs(30);
const SHORT_TIMEOUT: Duration = Duration::from_secs(15);
const ERROR_BODY_CHARS: usize = 500;
const THINKING_SUFFIX: &str = "-thinking";
const EVENT_STREAM_MIME: &str = "text/event-stream";
const TRUNCATED_STREAM_ERROR: &str = "Xclis оборвал поток до завершения ответа";

#[derive(Debug, PartialEq)]
enum StreamEvent {
    Text(String),
    InputTokens(u32),
    Done,
    ApiError(String),
}

#[derive(Default)]
struct OpenAiSseParser {
    buffer: Vec<u8>,
}

impl OpenAiSseParser {
    fn feed(&mut self, bytes: &[u8]) -> Vec<StreamEvent> {
        self.buffer.extend_from_slice(bytes);
        let mut out = Vec::new();
        while let Some((end, separator_len)) = find_sse_separator(&self.buffer) {
            let event = self.buffer[..end].to_vec();
            self.buffer.drain(..end + separator_len);
            out.extend(parse_sse_event(&event));
        }
        out
    }
}

fn find_sse_separator(bytes: &[u8]) -> Option<(usize, usize)> {
    let mut i = 0;
    while i + 1 < bytes.len() {
        if bytes[i] == b'\n' && bytes[i + 1] == b'\n' {
            return Some((i, 2));
        }
        if i + 3 < bytes.len()
            && bytes[i] == b'\r'
            && bytes[i + 1] == b'\n'
            && bytes[i + 2] == b'\r'
            && bytes[i + 3] == b'\n'
        {
            return Some((i, 4));
        }
        i += 1;
    }
    None
}

fn parse_sse_event(bytes: &[u8]) -> Vec<StreamEvent> {
    let text = String::from_utf8_lossy(bytes);
    let data = text
        .lines()
        .filter_map(|line| line.trim_end_matches('\r').strip_prefix("data:"))
        .map(str::trim_start)
        .collect::<Vec<_>>()
        .join("\n");
    if data.is_empty() {
        return Vec::new();
    }
    if data.trim() == "[DONE]" {
        return vec![StreamEvent::Done];
    }

    let value: Value = match serde_json::from_str(&data) {
        Ok(value) => value,
        Err(error) => {
            return vec![StreamEvent::ApiError(format!(
                "Xclis вернул некорректный SSE JSON: {error}; {}",
                data.chars().take(ERROR_BODY_CHARS).collect::<String>()
            ))]
        }
    };

    if let Some(message) = value["error"]["message"].as_str() {
        return vec![StreamEvent::ApiError(format!("Xclis: {message}"))];
    }

    let mut out = Vec::new();
    let input_tokens = value["usage"]["prompt_tokens"]
        .as_u64()
        .or_else(|| value["usage"]["input_tokens"].as_u64())
        .unwrap_or(0) as u32;
    if input_tokens > 0 {
        out.push(StreamEvent::InputTokens(input_tokens));
    }

    let choice = &value["choices"][0];
    let content = &choice["delta"]["content"];
    if let Some(text) = content.as_str() {
        if !text.is_empty() {
            out.push(StreamEvent::Text(text.to_string()));
        }
    } else if let Some(items) = content.as_array() {
        let text = items
            .iter()
            .filter_map(|item| item["text"].as_str().or_else(|| item["content"].as_str()))
            .collect::<Vec<_>>()
            .join("");
        if !text.is_empty() {
            out.push(StreamEvent::Text(text));
        }
    }

    if choice["finish_reason"].is_string() {
        out.push(StreamEvent::Done);
    }
    out
}

#[derive(Clone)]
pub struct XclisClient {
    api_key: String,
    base_url: String,
    client: reqwest::Client,
    catalog: ModelCatalog,
}

impl XclisClient {
    pub fn new(api_key: String, base_url: String) -> Self {
        let client = reqwest::Client::builder()
            .user_agent(APP_USER_AGENT)
            .connect_timeout(CONNECT_TIMEOUT)
            .read_timeout(STREAM_IDLE_TIMEOUT)
            .pool_idle_timeout(None)
            .http2_keep_alive_interval(HTTP2_KEEP_ALIVE_INTERVAL)
            .http2_keep_alive_while_idle(true)
            .no_proxy()
            .build()
            .expect("Xclis reqwest client");
        Self {
            api_key,
            base_url: base_url.trim_end_matches('/').to_string(),
            client,
            catalog: Arc::new(Mutex::new(Vec::new())),
        }
    }

    pub fn with_catalog(mut self, catalog: ModelCatalog) -> Self {
        self.catalog = catalog;
        self
    }

    fn selected_model(&self, requested: &str, thinking: bool) -> String {
        if thinking {
            if requested.ends_with(THINKING_SUFFIX) {
                return requested.to_string();
            }
            let supports_thinking = self
                .catalog
                .lock()
                .unwrap()
                .iter()
                .find(|m| m.id == requested)
                .is_some_and(|m| m.adaptive);
            if supports_thinking {
                return format!("{requested}{THINKING_SUFFIX}");
            }
        } else if let Some(base) = requested.strip_suffix(THINKING_SUFFIX) {
            return base.to_string();
        }
        requested.to_string()
    }

    fn openai_content(message: &ChatMessage) -> Value {
        if message.images.is_empty() {
            return json!(message.text);
        }
        let mut blocks = Vec::with_capacity(message.images.len() + 1);
        for image in &message.images {
            blocks.push(json!({
                "type": "image_url",
                "image_url": {
                    "url": format!("data:{};base64,{}", image.media_type, image.data)
                }
            }));
        }
        if !message.text.is_empty() {
            blocks.push(json!({"type": "text", "text": message.text}));
        }
        Value::Array(blocks)
    }

    fn chat_messages(request: &LlmRequest) -> Vec<Value> {
        let mut messages = Vec::with_capacity(request.messages.len() + 1);
        if !request.system.trim().is_empty() {
            messages.push(json!({"role": "system", "content": request.system}));
        }
        messages.extend(
            request
                .messages
                .iter()
                .filter(|m| !m.text.is_empty() || !m.images.is_empty())
                .map(|m| json!({"role": m.role, "content": Self::openai_content(m)})),
        );
        messages
    }

    fn chat_body(&self, request: &LlmRequest) -> Result<Value, LlmError> {
        if request.options.web_search {
            return Err(LlmError::Api(
                "Xclis: встроенный Anthropic web-search не документирован для /v1/chat/completions; выключи «Веб-поиск» или выбери Anthropic".into(),
            ));
        }
        Ok(json!({
            "model": self.selected_model(&request.model, request.options.thinking),
            "messages": Self::chat_messages(request),
            "max_tokens": MAX_TOKENS,
            "stream": true
        }))
    }

    fn anthropic_count_content(message: &ChatMessage) -> Value {
        if message.images.is_empty() {
            return json!(message.text);
        }
        let mut blocks = Vec::with_capacity(message.images.len() + 1);
        for image in &message.images {
            blocks.push(json!({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": image.media_type,
                    "data": image.data
                }
            }));
        }
        if !message.text.is_empty() {
            blocks.push(json!({"type": "text", "text": message.text}));
        }
        Value::Array(blocks)
    }

    fn count_body(&self, request: &LlmRequest) -> Value {
        let messages: Vec<Value> = request
            .messages
            .iter()
            .filter(|m| !m.text.is_empty() || !m.images.is_empty())
            .map(|m| {
                json!({
                    "role": m.role,
                    "content": Self::anthropic_count_content(m)
                })
            })
            .collect();
        let mut body = json!({
            "model": self.selected_model(&request.model, request.options.thinking),
            "messages": messages
        });
        if !request.system.trim().is_empty() {
            body["system"] = json!(request.system);
        }
        body
    }

    async fn checked_response(resp: reqwest::Response) -> Result<reqwest::Response, LlmError> {
        match resp.status().as_u16() {
            200 => Ok(resp),
            401 => Err(LlmError::BadApiKey),
            code => Err(LlmError::Api(Self::api_error(resp, code).await)),
        }
    }

    async fn api_error(resp: reqwest::Response, code: u16) -> String {
        let body = resp.text().await.unwrap_or_default();
        let parsed = serde_json::from_str::<Value>(&body).ok();
        let detail = parsed
            .as_ref()
            .and_then(|v| v["error"]["message"].as_str())
            .or_else(|| parsed.as_ref().and_then(|v| v["message"].as_str()))
            .map(str::to_string)
            .unwrap_or_else(|| {
                let text: String = body.trim().chars().take(ERROR_BODY_CHARS).collect();
                if text.is_empty() {
                    "ответ без тела".to_string()
                } else {
                    text
                }
            });
        format!("Xclis HTTP {code}: {detail}")
    }

    fn network_error(err: reqwest::Error) -> LlmError {
        let kind = if err.is_timeout() {
            "таймаут"
        } else if err.is_connect() {
            "ошибка подключения"
        } else if err.is_body() {
            "ошибка чтения ответа"
        } else {
            "ошибка запроса"
        };
        let mut details = vec![err.to_string()];
        let mut source = err.source();
        while let Some(cause) = source {
            let text = cause.to_string();
            if !text.trim().is_empty() && !details.iter().any(|item| item == &text) {
                details.push(text);
            }
            source = cause.source();
        }
        LlmError::Network(format!("Xclis {kind}: {}", details.join(": ")))
    }

    fn completion_text(value: &Value) -> String {
        let content = &value["choices"][0]["message"]["content"];
        if let Some(text) = content.as_str() {
            return text.trim().to_string();
        }
        if let Some(items) = content.as_array() {
            let text = items
                .iter()
                .filter_map(|item| item["text"].as_str().or_else(|| item["content"].as_str()))
                .collect::<Vec<_>>()
                .join("");
            if !text.trim().is_empty() {
                return text.trim().to_string();
            }
        }
        value["choices"][0]["message"]["reasoning_content"]
            .as_str()
            .unwrap_or_default()
            .trim()
            .to_string()
    }

    fn response_is_sse(resp: &reqwest::Response) -> bool {
        resp.headers()
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .is_some_and(|value| value.to_ascii_lowercase().contains(EVENT_STREAM_MIME))
    }

    async fn consume_json_response(
        resp: reqwest::Response,
        sink: &mut dyn LlmStreamSink,
    ) -> Result<(), LlmError> {
        let value: Value = resp.json().await.map_err(Self::network_error)?;
        let input_tokens = value["usage"]["prompt_tokens"]
            .as_u64()
            .or_else(|| value["usage"]["input_tokens"].as_u64())
            .unwrap_or(0) as u32;
        if input_tokens > 0 {
            sink.input_tokens(input_tokens);
        }
        let text = Self::completion_text(&value);
        if text.is_empty() {
            return Err(LlmError::Api(format!(
                "Xclis вернул 200, но без choices[0].message.content: {}",
                value.to_string().chars().take(ERROR_BODY_CHARS).collect::<String>()
            )));
        }
        sink.text_delta(&text);
        Ok(())
    }

    async fn consume_sse_response(
        resp: reqwest::Response,
        cancel: &CancellationToken,
        sink: &mut dyn LlmStreamSink,
    ) -> Result<(), LlmError> {
        let mut parser = OpenAiSseParser::default();
        let mut stream = resp.bytes_stream();
        loop {
            let chunk = tokio::select! {
                chunk = stream.next() => chunk,
                _ = cancel.cancelled() => return Err(LlmError::Cancelled),
            };
            let Some(chunk) = chunk else {
                return Err(LlmError::Network(TRUNCATED_STREAM_ERROR.into()));
            };
            let bytes = chunk.map_err(Self::network_error)?;
            for event in parser.feed(&bytes) {
                match event {
                    StreamEvent::Text(text) => sink.text_delta(&text),
                    StreamEvent::InputTokens(tokens) => sink.input_tokens(tokens),
                    StreamEvent::Done => return Ok(()),
                    StreamEvent::ApiError(message) => return Err(LlmError::Api(message)),
                }
            }
        }
    }

    fn model_version_key(id: &str) -> Vec<u32> {
        id.trim_end_matches(THINKING_SUFFIX)
            .split('-')
            .filter_map(|part| part.parse::<u32>().ok())
            .collect()
    }

    fn parse_models(value: &Value) -> Vec<ModelInfo> {
        let raw = value["data"].as_array().cloned().unwrap_or_default();
        let all_ids: Vec<String> = raw
            .iter()
            .filter_map(|v| v["id"].as_str().map(str::to_string))
            .collect();
        let mut models: Vec<ModelInfo> = raw
            .iter()
            .filter_map(|v| {
                let id = v["id"].as_str()?;
                if id.ends_with(THINKING_SUFFIX) {
                    return None;
                }
                let adaptive = all_ids
                    .iter()
                    .any(|candidate| candidate == &format!("{id}{THINKING_SUFFIX}"));
                Some(ModelInfo {
                    id: id.to_string(),
                    display_name: v["display_name"].as_str().unwrap_or(id).to_string(),
                    adaptive,
                    always_thinks: false,
                    code_exec: false,
                    max_input_tokens: 0,
                })
            })
            .collect();
        models.sort_by(|a, b| Self::model_version_key(&b.id).cmp(&Self::model_version_key(&a.id)));
        models
    }
}

#[async_trait::async_trait]
impl LlmProvider for XclisClient {
    async fn stream(
        &self,
        request: LlmRequest,
        cancel: CancellationToken,
        sink: &mut dyn LlmStreamSink,
    ) -> Result<(), LlmError> {
        let body = self.chat_body(&request)?;
        let send = self
            .client
            .post(format!("{}{}", self.base_url, CHAT_COMPLETIONS_PATH))
            .bearer_auth(&self.api_key)
            .header(ACCEPT, EVENT_STREAM_MIME)
            .json(&body)
            .send();
        let resp = tokio::select! {
            result = send => result.map_err(Self::network_error)?,
            _ = cancel.cancelled() => return Err(LlmError::Cancelled),
        };
        let resp = Self::checked_response(resp).await?;
        if Self::response_is_sse(&resp) {
            Self::consume_sse_response(resp, &cancel, sink).await
        } else {
            Self::consume_json_response(resp, sink).await
        }
    }

    async fn count_tokens(&self, request: LlmRequest) -> Result<u32, LlmError> {
        let resp = self
            .client
            .post(format!("{}{}", self.base_url, COUNT_TOKENS_PATH))
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", ANTHROPIC_VERSION)
            .json(&self.count_body(&request))
            .timeout(SHORT_TIMEOUT)
            .send()
            .await
            .map_err(Self::network_error)?;
        let resp = Self::checked_response(resp).await?;
        let value: Value = resp.json().await.map_err(Self::network_error)?;
        value["input_tokens"]
            .as_u64()
            .map(|n| n as u32)
            .ok_or_else(|| LlmError::Api("Xclis count_tokens: ответ без input_tokens".into()))
    }

    async fn list_models(&self) -> Result<Vec<ModelInfo>, LlmError> {
        let resp = self
            .client
            .get(format!("{}{}", self.base_url, MODELS_PATH))
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", ANTHROPIC_VERSION)
            .timeout(SHORT_TIMEOUT)
            .send()
            .await
            .map_err(Self::network_error)?;
        let resp = Self::checked_response(resp).await?;
        let value: Value = resp.json().await.map_err(Self::network_error)?;
        let models = Self::parse_models(&value);
        if !models.is_empty() {
            *self.catalog.lock().unwrap() = models.clone();
        }
        Ok(models)
    }

    async fn reachable(&self) -> bool {
        self.client
            .get(format!("{}{}", self.base_url, MODELS_PATH))
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", ANTHROPIC_VERSION)
            .timeout(SHORT_TIMEOUT)
            .send()
            .await
            .is_ok()
    }

    async fn warm_up(&self) {
        let _ = self
            .client
            .get(format!("{}{}", self.base_url, MODELS_PATH))
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", ANTHROPIC_VERSION)
            .timeout(SHORT_TIMEOUT)
            .send()
            .await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sse_parser_handles_utf8_split_between_network_chunks() {
        let event = "data: {\"choices\":[{\"delta\":{\"content\":\"Привет\"},\"finish_reason\":null}]}\n\n";
        let start = event.find("Привет").unwrap();
        let split = start + 1;
        let mut parser = OpenAiSseParser::default();
        assert!(parser.feed(&event.as_bytes()[..split]).is_empty());
        assert_eq!(
            parser.feed(&event.as_bytes()[split..]),
            vec![StreamEvent::Text("Привет".into())]
        );
    }

    #[test]
    fn sse_parser_handles_usage_crlf_and_done() {
        let mut parser = OpenAiSseParser::default();
        let events = parser.feed(
            b"data: {\"choices\":[{\"delta\":{},\"finish_reason\":null}],\"usage\":{\"prompt_tokens\":42}}\r\n\r\ndata: [DONE]\r\n\r\n",
        );
        assert_eq!(
            events,
            vec![StreamEvent::InputTokens(42), StreamEvent::Done]
        );
    }

    #[test]
    fn sse_parser_finishes_on_finish_reason_without_done_marker() {
        let mut parser = OpenAiSseParser::default();
        let events = parser.feed(
            b"data: {\"choices\":[{\"delta\":{\"content\":\"ok\"},\"finish_reason\":\"stop\"}]}\n\n",
        );
        assert_eq!(
            events,
            vec![StreamEvent::Text("ok".into()), StreamEvent::Done]
        );
    }
}
