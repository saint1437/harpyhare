use serde::Deserialize;
use serde_json::{json, Value};

#[derive(Debug, Clone, Deserialize)]
pub struct ImageAttachment {
    pub media_type: String,
    pub data: String, // base64
}

pub fn build_content(text: &str, images: &[ImageAttachment]) -> Value {
    if images.is_empty() {
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
    blocks.push(json!({"type": "text", "text": text}));
    Value::Array(blocks)
}

pub fn build_request_body(model: &str, system: &str, text: &str, images: &[ImageAttachment]) -> Value {
    let mut body = json!({
        "model": model,
        "max_tokens": 64000,
        "stream": true,
        "system": system,
        "messages": [{"role": "user", "content": build_content(text, images)}]
    });
    // claude-haiku-4-5 не поддерживает adaptive thinking — поле не отправляем (см. спеку)
    if !model.starts_with("claude-haiku") {
        body["thinking"] = json!({"type": "adaptive"});
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
}

impl SseParser {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn feed(&mut self, chunk: &str) -> Vec<SseOut> {
        self.buf.push_str(chunk);
        let mut out = Vec::new();
        while let Some(pos) = self.buf.find("\n\n") {
            let event_block = self.buf[..pos].to_string();
            self.buf.drain(..pos + 2);
            if let Some(parsed) = Self::parse_block(&event_block) {
                out.push(parsed);
            }
        }
        out
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
        assert_eq!(build_content("привет", &[]), json!("привет"));
    }

    #[test]
    fn images_go_before_text_as_blocks() {
        let imgs = vec![ImageAttachment {
            media_type: "image/png".into(),
            data: "AAAA".into(),
        }];
        assert_eq!(
            build_content("что на скриншоте?", &imgs),
            json!([
                {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": "AAAA"}},
                {"type": "text", "text": "что на скриншоте?"}
            ])
        );
    }

    #[test]
    fn request_body_shape_for_opus_includes_adaptive_thinking() {
        let body = build_request_body("claude-opus-4-8", "sys", "вопрос", &[]);
        assert_eq!(body["model"], "claude-opus-4-8");
        assert_eq!(body["max_tokens"], 64000);
        assert_eq!(body["stream"], true);
        assert_eq!(body["thinking"]["type"], "adaptive");
        assert_eq!(body["system"], "sys");
        assert_eq!(body["messages"][0]["role"], "user");
    }

    #[test]
    fn haiku_body_has_no_thinking_field() {
        let body = build_request_body("claude-haiku-4-5", "sys", "вопрос", &[]);
        assert!(body.get("thinking").is_none());
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
        let (a, b) = SSE_FIXTURE.split_at(95); // разрез посреди data-строки (внутри event 1: content_block_start)
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
}
