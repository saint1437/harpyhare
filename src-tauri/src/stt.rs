use crate::audio;

#[derive(Debug, thiserror::Error)]
pub enum SttError {
    #[error("Неверный ключ Groq — проверь в настройках")]
    BadApiKey,
    #[error("Сервис распознавания перегружен, попробуй позже ({0})")]
    Retryable(u16),
    #[error("Нет соединения — проверь интернет/VPN: {0}")]
    Network(String),
    #[error("{0}")]
    Other(String),
}

#[async_trait::async_trait]
pub trait SttEngine: Send + Sync {
    async fn transcribe(&self, samples_16k_mono: &[f32]) -> Result<String, SttError>;
}

pub struct GroqStt {
    api_key: String,
    base_url: String,
    timeout: std::time::Duration,
    client: reqwest::Client,
}

impl GroqStt {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            base_url: "https://api.groq.com".into(),
            timeout: std::time::Duration::from_secs(60),
            client: reqwest::Client::new(),
        }
    }
    pub fn with_base_url(mut self, url: String) -> Self {
        self.base_url = url;
        self
    }
    pub fn with_timeout(mut self, t: std::time::Duration) -> Self {
        self.timeout = t;
        self
    }
}

#[async_trait::async_trait]
impl SttEngine for GroqStt {
    async fn transcribe(&self, samples: &[f32]) -> Result<String, SttError> {
        let wav = audio::encode_wav_16k_mono(samples).map_err(|e| SttError::Other(e.to_string()))?;
        let part = reqwest::multipart::Part::bytes(wav)
            .file_name("audio.wav")
            .mime_str("audio/wav")
            .map_err(|e| SttError::Other(e.to_string()))?;
        let form = reqwest::multipart::Form::new()
            .part("file", part)
            .text("model", "whisper-large-v3-turbo")
            .text("language", "ru")
            .text("temperature", "0")
            .text("response_format", "json");
        let resp = self
            .client
            .post(format!("{}/openai/v1/audio/transcriptions", self.base_url))
            .bearer_auth(&self.api_key)
            .multipart(form)
            .timeout(self.timeout)
            .send()
            .await
            .map_err(|e| SttError::Network(e.to_string()))?;
        match resp.status().as_u16() {
            200 => {
                let v: serde_json::Value =
                    resp.json().await.map_err(|e| SttError::Other(e.to_string()))?;
                Ok(v["text"]
                    .as_str()
                    .ok_or_else(|| SttError::Other("ответ Groq без поля text".into()))?
                    .trim()
                    .to_string())
            }
            401 | 403 => Err(SttError::BadApiKey),
            code @ (429 | 500..=599) => Err(SttError::Retryable(code)),
            code => Err(SttError::Other(format!("Groq HTTP {code}"))),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{header, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    fn samples() -> Vec<f32> {
        vec![0.1f32; 16000] // 1 сек не-тишины
    }

    #[tokio::test]
    async fn transcribe_returns_text_on_success() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/openai/v1/audio/transcriptions"))
            .and(header("authorization", "Bearer gsk_test"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({"text": "привет мир"})))
            .mount(&server)
            .await;
        let stt = GroqStt::new("gsk_test".into()).with_base_url(server.uri());
        assert_eq!(stt.transcribe(&samples()).await.unwrap(), "привет мир");
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
}
