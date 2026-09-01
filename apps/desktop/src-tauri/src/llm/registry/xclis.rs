use futures_util::StreamExt;
use reqwest::header::{ACCEPT, CONTENT_TYPE};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::error::Error;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio_util::sync::CancellationToken;

use super::super::{
    ChatMessage, LlmError, LlmProvider, LlmRequest, LlmStreamSink, ModelCatalog, ModelInfo,
    APP_USER_AGENT,
};
use super::{catalog_models, LlmProviderSpec};

pub const PROVIDER_XCLIS: &str = "xclis";
pub const MODEL_PREFIX: &str = "xclis/";

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
/// Текст, которым Xclis отказывается обслуживать объявленную им же модель.
const MODEL_REJECTED_MARKER: &str = "not supported by any configured account";
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
    spec: &'static LlmProviderSpec,
    api_key: String,
    base_url: String,
    client: reqwest::Client,
    catalog: ModelCatalog,
    /// Модели, которые вендор перечислил в `/v1/models`, но обслуживать
    /// отказался. Заполняется проверкой при получении каталога и пополняется,
    /// если модель отвалилась уже в бою.
    rejected: Arc<Mutex<HashSet<String>>>,
}

impl XclisClient {
    pub fn new(spec: &'static LlmProviderSpec, api_key: String) -> Self {
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
            spec,
            api_key,
            base_url: spec.wire.base_url().trim_end_matches('/').to_string(),
            client,
            catalog: Arc::new(Mutex::new(Vec::new())),
            rejected: Arc::new(Mutex::new(HashSet::new())),
        }
    }

    pub fn with_catalog(mut self, catalog: ModelCatalog) -> Self {
        self.catalog = catalog;
        self
    }

    fn upstream_id(model_id: &str) -> &str {
        model_id.strip_prefix(MODEL_PREFIX).unwrap_or(model_id)
    }

    fn selected_model(&self, requested: &str, thinking: bool) -> String {
        let requested = Self::upstream_id(requested);
        if thinking {
            if requested.ends_with(THINKING_SUFFIX) {
                return requested.to_string();
            }
            let app_id = format!("{MODEL_PREFIX}{requested}");
            let live_capability = {
                let catalog = self.catalog.lock().unwrap();
                catalog.iter().find(|m| m.id == app_id).map(|m| m.adaptive)
            };
            let supports_thinking = live_capability.unwrap_or_else(|| {
                catalog_models(PROVIDER_XCLIS)
                    .iter()
                    .find(|m| m.id == app_id)
                    .is_some_and(|m| m.adaptive)
            });
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
                "Xclis: встроенный web-search не документирован для /v1/chat/completions; выключи «Веб-поиск» или выбери другого провайдера".into(),
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
            .map(|m| json!({"role": m.role, "content": Self::anthropic_count_content(m)}))
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
            401 | 403 => Err(LlmError::BadApiKey("Xclis")),
            code @ (429 | 500..=599) => Err(LlmError::Retryable(code)),
            code => Err(LlmError::Api(Self::api_error(resp, code).await)),
        }
    }

    /// **Каталог Xclis не сходится с реальностью, и это проверено живьём:** из
    /// четырнадцати объявленных группе моделей четыре отвечали 404 «not
    /// supported by any configured account in this group», включая единственную
    /// суффиксную `-thinking`. Показывать их в пикере значит предлагать выбор,
    /// который заведомо упадёт на отправке.
    ///
    /// Проверка бесплатная: шлюз сверяет модель с аккаунтом РАНЬШЕ, чем
    /// валидирует тело запроса, поэтому пустой `messages: []` у живой модели
    /// даёт 400 «all messages have empty content», а у чужой — тот самый 404.
    /// Ни одного сгенерированного токена. Проверки идут параллельно: каталог
    /// приходит целиком, и ждать их по очереди незачем.
    async fn served_ids(&self, advertised: Vec<String>) -> HashSet<String> {
        let verdicts =
            futures_util::future::join_all(advertised.iter().map(|id| self.model_is_served(id)))
                .await;
        let mut rejected = self.rejected.lock().unwrap();
        advertised
            .into_iter()
            .zip(verdicts)
            .filter_map(|(id, served)| {
                if served {
                    return Some(id);
                }
                rejected.insert(id);
                None
            })
            .collect()
    }

    /// Обслуживает ли группа эту модель. **Сетевой сбой считается «да»**: иначе
    /// один таймаут вычистил бы пикер целиком, а это хуже лишней строки в нём.
    async fn model_is_served(&self, model: &str) -> bool {
        let resp = self
            .client
            .post(format!("{}{}", self.base_url, CHAT_COMPLETIONS_PATH))
            .bearer_auth(&self.api_key)
            .json(&json!({"model": model, "messages": []}))
            .timeout(SHORT_TIMEOUT)
            .send()
            .await;
        let Ok(resp) = resp else { return true };
        if resp.status().as_u16() != 404 {
            return true;
        }
        !resp.text().await.unwrap_or_default().contains(MODEL_REJECTED_MARKER)
    }

    /// Отказ обслужить модель. Вендор отвечает на это то `model_not_found`, то
    /// `server_error` — оба раза с 404 и одним и тем же текстом, поэтому
    /// опознаём по тексту, а не по типу ошибки.
    fn is_model_rejection(message: &str) -> bool {
        message.contains(MODEL_REJECTED_MARKER)
    }

    fn remember_rejected(&self, model: &str) {
        self.rejected.lock().unwrap().insert(model.to_string());
        let app_id = format!("{MODEL_PREFIX}{model}");
        self.catalog.lock().unwrap().retain(|m| m.id != app_id);
    }

    /// Ошибка запроса с побочным эффектом: отказ по модели запоминается, чтобы
    /// пикер перестал её предлагать.
    fn note_model_rejection<T>(&self, model: &str, result: Result<T, LlmError>) -> Result<T, LlmError> {
        if let Err(LlmError::Api(message)) = &result {
            if Self::is_model_rejection(message) {
                self.remember_rejected(model);
            }
        }
        result
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
                if text.is_empty() { "ответ без тела".to_string() } else { text }
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

    fn advertised_ids(value: &Value) -> Vec<String> {
        value["data"]
            .as_array()
            .map(|raw| raw.iter().filter_map(|v| v["id"].as_str().map(str::to_string)).collect())
            .unwrap_or_default()
    }

    /// Модели строятся ТОЛЬКО из обслуживаемых id — и это же множество решает,
    /// умеет ли модель размышлять. Считать `adaptive` по объявленному списку
    /// нельзя: у Xclis единственная суффиксная модель группы была объявлена и
    /// при этом мертва, то есть переключатель размышления обещал бы то, чего
    /// вендор не сделает, и отправка падала бы с 404.
    fn models_from(value: &Value, served: &HashSet<String>) -> Vec<ModelInfo> {
        let raw = value["data"].as_array().cloned().unwrap_or_default();
        let all_ids = served;
        let mut models: Vec<ModelInfo> = raw
            .iter()
            .filter_map(|v| {
                let upstream_id = v["id"].as_str()?;
                if upstream_id.ends_with(THINKING_SUFFIX) || !all_ids.contains(upstream_id) {
                    return None;
                }
                let adaptive = all_ids.contains(&format!("{upstream_id}{THINKING_SUFFIX}"));
                Some(ModelInfo {
                    id: format!("{MODEL_PREFIX}{upstream_id}"),
                    display_name: v["display_name"].as_str().unwrap_or(upstream_id).to_string(),
                    provider: PROVIDER_XCLIS.into(),
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
    fn provider_id(&self) -> &'static str {
        self.spec.id
    }

    fn known_models(&self) -> Vec<ModelInfo> {
        catalog_models(PROVIDER_XCLIS)
    }

    async fn stream(
        &self,
        request: LlmRequest,
        cancel: CancellationToken,
        sink: &mut dyn LlmStreamSink,
    ) -> Result<(), LlmError> {
        let model = self.selected_model(&request.model, request.options.thinking);
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
        let resp = self.note_model_rejection(&model, Self::checked_response(resp).await)?;
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
        let resp = self.note_model_rejection(
            &self.selected_model(&request.model, request.options.thinking),
            Self::checked_response(resp).await,
        )?;
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
        let served = self.served_ids(Self::advertised_ids(&value)).await;
        let models = Self::models_from(&value, &served);
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

    fn test_client(base_url: &str) -> XclisClient {
        let spec = crate::llm::registry::spec(PROVIDER_XCLIS).expect("Xclis provider");
        let mut client = XclisClient::new(spec, "key".into());
        client.base_url = base_url.trim_end_matches('/').to_string();
        client
    }

    /// Сопоставляет тело пробы по имени модели: обе пробы уходят на один путь.
    struct BodyModelIs(&'static str);

    impl wiremock::Match for BodyModelIs {
        fn matches(&self, request: &wiremock::Request) -> bool {
            serde_json::from_slice::<Value>(&request.body)
                .ok()
                .and_then(|v| v["model"].as_str().map(str::to_string))
                .is_some_and(|model| model == self.0)
        }
    }

    #[test]
    fn model_ids_are_namespaced_and_thinking_variants_are_hidden() {
        let value = json!({
            "data": [
                {"id": "claude-sonnet-5", "display_name": "Claude Sonnet 5"},
                {"id": "claude-sonnet-5-thinking", "display_name": "Claude Sonnet 5 Thinking"}
            ]
        });
        let served = XclisClient::advertised_ids(&value).into_iter().collect();
        let models = XclisClient::models_from(&value, &served);
        assert_eq!(models.len(), 1);
        assert_eq!(models[0].id, "xclis/claude-sonnet-5");
        assert_eq!(models[0].provider, PROVIDER_XCLIS);
        assert!(models[0].adaptive);
    }

    /// До прихода живого каталога суффикс не дописывается НИКОМУ: вшитый список
    /// не знает, какие суффиксные модели завёл вендор для этой группы аккаунта.
    /// Проверено живьём: `claude-opus-4-6-thinking` существует, а
    /// `claude-sonnet-5-thinking` отдаёт 404 — угадывание здесь стоит запроса
    /// в несуществующую модель.
    #[test]
    fn thinking_suffix_is_not_guessed_before_live_models_arrive() {
        let spec = crate::llm::registry::spec(PROVIDER_XCLIS).expect("Xclis provider");
        let client = XclisClient::new(spec, "key".into());
        assert_eq!(client.selected_model("xclis/claude-sonnet-5", true), "claude-sonnet-5");
        assert_eq!(client.selected_model("xclis/gpt-5.6-sol", true), "gpt-5.6-sol");
    }

    /// А пришедший каталог включает суффикс ровно там, где двойник реально есть.
    #[test]
    fn thinking_suffix_follows_the_live_catalog() {
        let spec = crate::llm::registry::spec(PROVIDER_XCLIS).expect("Xclis provider");
        let client = XclisClient::new(spec, "key".into());
        let live_catalog = json!({
            "data": [
                {"id": "claude-opus-4-6", "display_name": "Claude Opus 4.6"},
                {"id": "claude-opus-4-6-thinking", "display_name": "Claude Opus 4.6 Thinking"},
                {"id": "claude-sonnet-5", "display_name": "Claude Sonnet 5"}
            ]
        });
        let served = XclisClient::advertised_ids(&live_catalog).into_iter().collect();
        *client.catalog.lock().unwrap() = XclisClient::models_from(&live_catalog, &served);
        assert_eq!(
            client.selected_model("xclis/claude-opus-4-6", true),
            "claude-opus-4-6-thinking"
        );
        assert_eq!(client.selected_model("xclis/claude-sonnet-5", true), "claude-sonnet-5");
    }

    /// Каталог вендора перечисляет модели, которых группа не обслуживает —
    /// проверено живьём. Отсев идёт бесплатной пробой: шлюз сверяет модель с
    /// аккаунтом раньше, чем валидирует тело, поэтому пустой `messages: []`
    /// у чужой модели даёт 404 с этим текстом, а у своей — 400 про пустое тело.
    #[tokio::test]
    async fn advertised_but_unserved_models_are_dropped_from_the_catalog() {
        let server = wiremock::MockServer::start().await;
        wiremock::Mock::given(wiremock::matchers::method("POST"))
            .and(wiremock::matchers::path(CHAT_COMPLETIONS_PATH))
            .and(BodyModelIs("dead"))
            .respond_with(wiremock::ResponseTemplate::new(404).set_body_string(
                r#"{"error":{"message":"Model \"dead\" is not supported by any configured account in this group"}}"#,
            ))
            .mount(&server)
            .await;
        wiremock::Mock::given(wiremock::matchers::method("POST"))
            .and(wiremock::matchers::path(CHAT_COMPLETIONS_PATH))
            .respond_with(wiremock::ResponseTemplate::new(400).set_body_string(
                r#"{"error":{"message":"messages: all messages have empty content"}}"#,
            ))
            .mount(&server)
            .await;

        let client = test_client(&server.uri());
        let catalog = json!({"data": [{"id": "alive"}, {"id": "dead"}]});
        let served = client.served_ids(XclisClient::advertised_ids(&catalog)).await;
        let models = XclisClient::models_from(&catalog, &served);
        assert_eq!(models.iter().map(|m| m.id.as_str()).collect::<Vec<_>>(), ["xclis/alive"]);
    }

    /// Объявленная, но мёртвая суффиксная модель не должна давать базовой
    /// признак «умеет размышлять»: на этом эндпоинте рассуждение включается
    /// ТОЛЬКО отдельной моделью — `reasoning_effort` и `thinking` шлюз молча
    /// игнорирует (проверено живьём), — поэтому обещание обернулось бы 404.
    #[test]
    fn thinking_capability_ignores_advertised_but_dead_twins() {
        let catalog = json!({
            "data": [
                {"id": "opus"},
                {"id": "opus-thinking"},
                {"id": "sonnet"},
                {"id": "sonnet-thinking"}
            ]
        });
        // Живыми оказались базовые и только один из двух суффиксных.
        let served: HashSet<String> =
            ["opus", "opus-thinking", "sonnet"].iter().map(|s| s.to_string()).collect();
        let models = XclisClient::models_from(&catalog, &served);
        let adaptive: Vec<(&str, bool)> =
            models.iter().map(|m| (m.id.as_str(), m.adaptive)).collect();
        assert!(adaptive.contains(&("xclis/opus", true)), "живой двойник — способность есть");
        assert!(adaptive.contains(&("xclis/sonnet", false)), "мёртвый двойник — способности нет");
    }

    /// Сетевой сбой не должен вычищать пикер: одна недоступность сервера хуже
    /// лишней строки в списке.
    #[tokio::test]
    async fn unreachable_vendor_keeps_the_advertised_models() {
        let client = test_client("http://127.0.0.1:1");
        let catalog = json!({"data": [{"id": "alive"}]});
        let served = client.served_ids(XclisClient::advertised_ids(&catalog)).await;
        assert_eq!(XclisClient::models_from(&catalog, &served).len(), 1);
    }

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
        assert_eq!(events, vec![StreamEvent::InputTokens(42), StreamEvent::Done]);
    }

    #[test]
    fn sse_parser_finishes_on_finish_reason_without_done_marker() {
        let mut parser = OpenAiSseParser::default();
        let events = parser.feed(
            b"data: {\"choices\":[{\"delta\":{\"content\":\"ok\"},\"finish_reason\":\"stop\"}]}\n\n",
        );
        assert_eq!(events, vec![StreamEvent::Text("ok".into()), StreamEvent::Done]);
    }

    #[test]
    fn sse_parser_finishes_on_done_marker() {
        let mut parser = OpenAiSseParser::default();
        assert_eq!(parser.feed(b"data: [DONE]\n\n"), vec![StreamEvent::Done]);
    }
}
