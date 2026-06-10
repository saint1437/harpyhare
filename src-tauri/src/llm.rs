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
}
