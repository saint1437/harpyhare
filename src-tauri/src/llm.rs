use futures_util::StreamExt;
use serde::Deserialize;
use serde_json::{json, Value};
use std::time::Duration;
use tokio_util::sync::CancellationToken;

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

/// Клиент с «вечно тёплым» пулом: h2-пинги в простое + пул без экспирации,
/// чтобы каждый запрос попадал в уже установленное TLS-соединение
/// (холодный handshake к api.anthropic.com — это ~200–500мс TTFB).
fn build_http_client(read_timeout: Duration) -> reqwest::Client {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .read_timeout(read_timeout)
        .pool_idle_timeout(None)
        .http2_keep_alive_interval(Duration::from_secs(30))
        .http2_keep_alive_while_idle(true)
        .build()
        .expect("reqwest client")
}

impl AnthropicClient {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            base_url: "https://api.anthropic.com".into(),
            client: build_http_client(Duration::from_secs(60)),
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

    /// Прогрев соединения: дешёвый GET ради DNS+TCP+TLS, ответ не важен.
    pub async fn warm_up(&self) {
        let _ = self
            .client
            .get(format!("{}/v1/models", self.base_url))
            .timeout(Duration::from_secs(5))
            .send()
            .await;
    }

    /// Стримит ответ; каждая текстовая дельта уходит в on_delta. Отмена — через token.
    pub async fn stream_message(
        &self,
        body: serde_json::Value,
        cancel: CancellationToken,
        mut on_delta: impl FnMut(&str),
    ) -> Result<(), LlmError> {
        let mut req = self
            .client
            .post(format!("{}/v1/messages", self.base_url))
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01");
        // fast mode — research preview: beta-заголовок обязателен вместе с body.speed
        if body.get("speed").is_some() {
            req = req.header("anthropic-beta", "fast-mode-2026-02-01");
        }
        let send = req.json(&body).send();
        let resp = tokio::select! {
            r = send => r.map_err(|e| LlmError::Network(e.to_string()))?,
            _ = cancel.cancelled() => return Err(LlmError::Cancelled),
        };
        match resp.status().as_u16() {
            200 => {}
            401 | 403 => return Err(LlmError::BadApiKey),
            code @ (429 | 500..=599) => return Err(LlmError::Retryable(code)),
            code => {
                // В теле ошибки API лежит человекочитаемая причина (низкий баланс,
                // невалидное поле и т.п.) — показываем её, а не голый код.
                let body = resp.text().await.unwrap_or_default();
                let msg = serde_json::from_str::<Value>(&body)
                    .ok()
                    .and_then(|v| v["error"]["message"].as_str().map(str::to_string))
                    .unwrap_or_else(|| format!("HTTP {code}"));
                return Err(LlmError::Api(msg));
            }
        }
        let mut parser = SseParser::new();
        let mut stream = resp.bytes_stream();
        loop {
            let chunk = tokio::select! {
                c = stream.next() => c,
                _ = cancel.cancelled() => return Err(LlmError::Cancelled),
            };
            let Some(chunk) = chunk else {
                return Err(LlmError::Network("ответ оборван до завершения".into()));
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
}

#[derive(Debug, Clone, Deserialize)]
pub struct ImageAttachment {
    pub media_type: String,
    pub data: String, // base64
}

#[derive(Debug, Clone, Deserialize)]
pub struct ChatMessage {
    pub role: String, // "user" | "assistant"
    pub text: String,
    #[serde(default)]
    pub images: Vec<ImageAttachment>,
}

/// `cache_breakpoint` — поставить cache_control на последний блок (используется
/// только для последнего сообщения истории: брейкпоинт prompt-кэша, см. build_request_body).
/// С брейкпоинтом контент всегда уходит массивом блоков (на строку маркер не повесить).
pub fn build_content(text: &str, images: &[ImageAttachment], cache_breakpoint: bool) -> Value {
    if images.is_empty() && !cache_breakpoint {
        return json!(text);
    }
    let mut blocks: Vec<Value> = images
        .iter()
        .map(|img| {
            json!({
                "type": "image",
                "source": {"type": "base64", "media_type": img.media_type, "data": img.data}
            })
        })
        .collect();
    if !text.is_empty() {
        blocks.push(json!({"type": "text", "text": text}));
    }
    if blocks.is_empty() {
        return json!(text); // пустое сообщение — фронт таких не шлёт, но не ломаемся
    }
    if cache_breakpoint {
        if let Some(last) = blocks.last_mut() {
            last["cache_control"] = json!({"type": "ephemeral"});
        }
    }
    Value::Array(blocks)
}

/// `thinking=false` — поле thinking не отправляется вовсе (на Opus 4.8 это «без размышлений»);
/// haiku его не поддерживает независимо от флага. `fast=true` + opus-4-8 → speed:"fast"
/// (beta-заголовок добавляет stream_message).
///
/// Prompt caching: чат stateless и каждый запрос повторяет всю историю, поэтому ставим два
/// брейкпоинта — на system-блоке и на последнем блоке последнего сообщения. Follow-up в том же
/// чате читает весь префикс из кэша (~0.1x цены, заметно ниже TTFB на историях с картинками).
/// Короткие промпты ниже минимума кэшируемого префикса просто молча не кэшируются.
pub fn build_request_body(
    model: &str,
    system: &str,
    messages: &[ChatMessage],
    thinking: bool,
    fast: bool,
) -> Value {
    // Пустые сообщения (ответ без текста и т.п.) отбрасываем: API отвергает
    // пустой content, и один такой элемент навсегда ломал бы отправку чата.
    let kept: Vec<&ChatMessage> = messages
        .iter()
        .filter(|m| !m.text.is_empty() || !m.images.is_empty())
        .collect();
    let last = kept.len().saturating_sub(1);
    let msgs: Vec<Value> = kept
        .iter()
        .enumerate()
        .map(|(i, m)| json!({"role": m.role, "content": build_content(&m.text, &m.images, i == last)}))
        .collect();
    let system_value = if system.is_empty() {
        json!("")
    } else {
        json!([{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}])
    };
    let mut body = json!({
        "model": model,
        "max_tokens": 64000,
        "stream": true,
        "system": system_value,
        "messages": msgs
    });
    if thinking && !model.starts_with("claude-haiku") {
        body["thinking"] = json!({"type": "adaptive"});
    }
    if fast && model == "claude-opus-4-8" {
        body["speed"] = json!("fast");
    }
    body
}

#[derive(Debug, Clone, PartialEq)]
pub enum SseOut {
    TextDelta(String),
    Done,
    ApiError(String),
}

/// Инкрементальный парсер SSE-потока Anthropic: копит байты, режет по "\n\n",
/// отдаёт только нужное UI (text_delta / конец / ошибка). thinking-дельты игнорируются.
#[derive(Default)]
pub struct SseParser {
    buf: String,
    /// Неполный UTF-8 хвост от предыдущего чанка (буферизуется до следующего вызова feed_bytes).
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
        while let Some(rel) = self.buf[start..].find("\n\n") {
            let pos = start + rel;
            if let Some(parsed) = Self::parse_block(&self.buf[start..pos]) {
                out.push(parsed);
            }
            start = pos + 2;
        }
        self.buf.drain(..start);
        out
    }

    /// Принимает сырые байты HTTP-чанка; неполный UTF-8 хвост буферизуется до следующего чанка.
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
        let data_line = block.lines().find(|l| l.starts_with("data: "))?;
        let v: serde_json::Value = serde_json::from_str(&data_line[6..]).ok()?;
        match v["type"].as_str()? {
            "content_block_delta" if v["delta"]["type"] == "text_delta" => {
                Some(SseOut::TextDelta(v["delta"]["text"].as_str()?.to_string()))
            }
            "message_stop" => Some(SseOut::Done),
            "error" => Some(SseOut::ApiError(
                v["error"]["message"].as_str().unwrap_or("неизвестная ошибка API").to_string(),
            )),
            _ => None, // message_start, thinking_delta, content_block_stop, message_delta и пр.
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

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
        // текст без картинок: массив из одного text-блока с cache_control
        let content = build_content("вопрос", &[], true);
        assert_eq!(
            content,
            json!([{"type": "text", "text": "вопрос", "cache_control": {"type": "ephemeral"}}])
        );
        // картинки + текст: маркер на последнем (текстовом) блоке
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
        let body = build_request_body("claude-opus-4-8", "sys", &msgs, true, false);
        assert_eq!(body["model"], "claude-opus-4-8");
        assert_eq!(body["max_tokens"], 64000);
        assert_eq!(body["stream"], true);
        assert_eq!(body["thinking"]["type"], "adaptive");
        // system — блок с брейкпоинтом prompt-кэша
        assert_eq!(body["system"][0]["text"], "sys");
        assert_eq!(body["system"][0]["cache_control"]["type"], "ephemeral");
        assert_eq!(body["messages"][0]["role"], "user");
        // единственное сообщение = последнее → блок с cache_control
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
        let body = build_request_body("claude-opus-4-8", "sys", &msgs, true, false);
        assert_eq!(body["messages"].as_array().unwrap().len(), 3);
        // не-последние сообщения остаются плоскими строками (стабильный префикс для кэша)
        assert_eq!(body["messages"][1]["role"], "assistant");
        assert_eq!(body["messages"][1]["content"], "2");
        // последнее несёт брейкпоинт
        assert_eq!(body["messages"][2]["content"][0]["text"], "а 2+2?");
        assert_eq!(
            body["messages"][2]["content"][0]["cache_control"]["type"],
            "ephemeral"
        );
    }

    #[test]
    fn haiku_body_has_no_thinking_field() {
        let msgs = vec![ChatMessage {
            role: "user".into(),
            text: "вопрос".into(),
            images: vec![],
        }];
        let body = build_request_body("claude-haiku-4-5", "sys", &msgs, true, false);
        assert!(body.get("thinking").is_none());
    }

    #[test]
    fn thinking_disabled_omits_field_entirely() {
        let msgs = vec![ChatMessage { role: "user".into(), text: "q".into(), images: vec![] }];
        let body = build_request_body("claude-opus-4-8", "sys", &msgs, false, false);
        assert!(body.get("thinking").is_none());
    }

    #[test]
    fn fast_mode_only_for_opus_4_8() {
        let msgs = vec![ChatMessage { role: "user".into(), text: "q".into(), images: vec![] }];
        let body = build_request_body("claude-opus-4-8", "", &msgs, true, true);
        assert_eq!(body["speed"], "fast");
        // на других моделях speed не отправляем — там он не поддержан
        let body = build_request_body("claude-sonnet-4-6", "", &msgs, true, true);
        assert!(body.get("speed").is_none());
        let body = build_request_body("claude-haiku-4-5", "", &msgs, true, true);
        assert!(body.get("speed").is_none());
    }

    #[test]
    fn empty_messages_are_dropped_from_history() {
        let msgs = vec![
            ChatMessage { role: "user".into(), text: "1+1?".into(), images: vec![] },
            ChatMessage { role: "assistant".into(), text: "".into(), images: vec![] },
            ChatMessage { role: "user".into(), text: "а 2+2?".into(), images: vec![] },
        ];
        let body = build_request_body("claude-opus-4-8", "s", &msgs, true, false);
        let arr = body["messages"].as_array().unwrap();
        assert_eq!(arr.len(), 2, "пустой assistant выброшен");
        assert_eq!(arr[0]["content"], "1+1?");
        // брейкпоинт кэша — на последнем из оставшихся
        assert_eq!(arr[1]["content"][0]["cache_control"]["type"], "ephemeral");
    }

    #[test]
    fn empty_system_stays_plain_string() {
        let msgs = vec![ChatMessage { role: "user".into(), text: "q".into(), images: vec![] }];
        let body = build_request_body("claude-opus-4-8", "", &msgs, true, false);
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
        let (a, b) = SSE_FIXTURE.split_at(95); // разрез посреди строки события (event-line)
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

    // Item 1: пустой text-блок при наличии картинок не должен добавляться
    #[test]
    fn empty_text_with_images_has_no_text_block() {
        let imgs = vec![ImageAttachment { media_type: "image/png".into(), data: "AAAA".into() }];
        let content = build_content("", &imgs, false);
        let arr = content.as_array().unwrap();
        assert_eq!(arr.len(), 1);
        assert_eq!(arr[0]["type"], "image");
    }

    // Item 2: feed_bytes буферизует неполный UTF-8 хвост
    #[test]
    fn feed_bytes_handles_utf8_split_across_chunks() {
        let raw = "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"Привет\"}}\n\n";
        let bytes = raw.as_bytes();
        // режем посреди многобайтового символа внутри "Привет"
        let cut = raw.find("Привет").unwrap() + 3; // 3 байта = середина второго кириллического символа
        assert!(std::str::from_utf8(&bytes[..cut]).is_err(), "разрез должен попадать в середину символа");
        let mut p = SseParser::new();
        let mut out = p.feed_bytes(&bytes[..cut]);
        out.extend(p.feed_bytes(&bytes[cut..]));
        assert_eq!(out, vec![SseOut::TextDelta("Привет".to_string())]);
    }

    // Item 4: разрез посреди data-JSON
    #[test]
    fn sse_parser_handles_chunk_split_mid_data_json() {
        let raw = "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"hi\"}}\n\n";
        let mid = raw.find("text_delta").unwrap() + 5; // внутри data-JSON
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
                build_request_body("claude-opus-4-8", "s", &msgs, true, false),
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
        // без заголовка мок не сматчится (404) и стрим вернёт ошибку
        client
            .stream_message(
                build_request_body("claude-opus-4-8", "s", &msgs, true, true),
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
                build_request_body("claude-opus-4-8", "s", &msgs, true, false),
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
                build_request_body("claude-opus-4-8", "s", &msgs, true, false),
                tokio_util::sync::CancellationToken::new(),
                move |d| c2.lock().unwrap().push_str(d),
            )
            .await
            .unwrap_err();
        assert!(matches!(err, LlmError::Network(_)));
        assert_eq!(*collected.lock().unwrap(), "При"); // частичные дельты успели уйти
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
                build_request_body("claude-opus-4-8", "s", &msgs, true, false),
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
                build_request_body("claude-opus-4-8", "s", &msgs, true, false),
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
        cancel.cancel(); // отменяем сразу
        let msgs = vec![ChatMessage { role: "user".into(), text: "q".into(), images: vec![] }];
        let err = client
            .stream_message(
                build_request_body("claude-opus-4-8", "s", &msgs, true, false),
                cancel,
                |_| {},
            )
            .await
            .unwrap_err();
        assert!(matches!(err, LlmError::Cancelled));
    }
}
