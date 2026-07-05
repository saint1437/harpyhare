use crate::audio;

const GROQ_BASE_URL: &str = "https://api.groq.com";
const TRANSCRIPTIONS_ENDPOINT: &str = "/openai/v1/audio/transcriptions";
const TRANSLATIONS_ENDPOINT: &str = "/openai/v1/audio/translations";
const WARM_UP_ENDPOINT: &str = "/openai/v1/models";

const TRANSCRIBE_MODEL: &str = "whisper-large-v3-turbo";
const TRANSLATE_MODEL: &str = "whisper-large-v3";
const DEFAULT_LANGUAGE: &str = "ru";

const WAV_MIME: &str = "audio/wav";
const WAV_FILE_NAME: &str = "audio.wav";
const CANCELLED_MESSAGE: &str = "отменено";

const CONNECT_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(10);
const HTTP2_KEEP_ALIVE_INTERVAL: std::time::Duration = std::time::Duration::from_secs(30);
const DEFAULT_REQUEST_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(60);
const WARM_UP_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(5);
const STREAM_REQUEST_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(11 * 60);

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

#[derive(Clone)]
pub struct GroqStt {
    api_key: String,
    base_url: String,
    timeout: std::time::Duration,
    client: reqwest::Client,
    language: String,
    translate: bool,
}

fn warm_pooled_client() -> reqwest::Client {
    reqwest::Client::builder()
        .connect_timeout(CONNECT_TIMEOUT)
        .pool_idle_timeout(None)
        .http2_keep_alive_interval(HTTP2_KEEP_ALIVE_INTERVAL)
        .http2_keep_alive_while_idle(true)
        .build()
        .expect("reqwest client")
}

impl GroqStt {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            base_url: GROQ_BASE_URL.into(),
            timeout: DEFAULT_REQUEST_TIMEOUT,
            client: warm_pooled_client(),
            language: DEFAULT_LANGUAGE.into(),
            translate: false,
        }
    }

    pub async fn warm_up(&self) {
        let _ = self
            .client
            .get(format!("{}{}", self.base_url, WARM_UP_ENDPOINT))
            .timeout(WARM_UP_TIMEOUT)
            .send()
            .await;
    }
    pub fn with_base_url(mut self, url: String) -> Self {
        self.base_url = url;
        self
    }
    pub fn with_timeout(mut self, t: std::time::Duration) -> Self {
        self.timeout = t;
        self
    }
    pub fn with_language(mut self, language: String) -> Self {
        self.language = language;
        self
    }
    pub fn with_translate(mut self, translate: bool) -> Self {
        self.translate = translate;
        self
    }
}

impl GroqStt {
    fn model(&self) -> &'static str {
        if self.translate { TRANSLATE_MODEL } else { TRANSCRIBE_MODEL }
    }

    fn form_with(&self, part: reqwest::multipart::Part) -> reqwest::multipart::Form {
        let mut form = reqwest::multipart::Form::new()
            .part("file", part.file_name(WAV_FILE_NAME))
            .text("model", self.model())
            .text("temperature", "0")
            .text("response_format", "json");
        if !self.translate && !self.language.is_empty() {
            form = form.text("language", self.language.clone());
        }
        form
    }

    fn endpoint(&self) -> &'static str {
        if self.translate { TRANSLATIONS_ENDPOINT } else { TRANSCRIPTIONS_ENDPOINT }
    }

    fn request_with(
        &self,
        part: reqwest::multipart::Part,
        timeout: std::time::Duration,
    ) -> reqwest::RequestBuilder {
        self.client
            .post(format!("{}{}", self.base_url, self.endpoint()))
            .bearer_auth(&self.api_key)
            .multipart(self.form_with(part))
            .timeout(timeout)
    }

    async fn parse_response(resp: reqwest::Response) -> Result<String, SttError> {
        match resp.status().as_u16() {
            200 => Self::text_from_success(resp).await,
            401 | 403 => Err(SttError::BadApiKey),
            code @ (429 | 500..=599) => Err(SttError::Retryable(code)),
            code => Err(Self::error_from_body(code, resp).await),
        }
    }

    async fn text_from_success(resp: reqwest::Response) -> Result<String, SttError> {
        let v: serde_json::Value = resp.json().await.map_err(|e| SttError::Other(e.to_string()))?;
        Ok(v["text"]
            .as_str()
            .ok_or_else(|| SttError::Other("ответ Groq без поля text".into()))?
            .trim()
            .to_string())
    }

    async fn error_from_body(code: u16, resp: reqwest::Response) -> SttError {
        let body = resp.text().await.unwrap_or_default();
        let msg = serde_json::from_str::<serde_json::Value>(&body)
            .ok()
            .and_then(|v| v["error"]["message"].as_str().map(str::to_string))
            .unwrap_or_else(|| format!("Groq HTTP {code}"));
        SttError::Other(msg)
    }

    pub async fn transcribe_stream(
        &self,
        body: reqwest::Body,
        cancel: tokio_util::sync::CancellationToken,
    ) -> Result<String, SttError> {
        let part = reqwest::multipart::Part::stream(body)
            .mime_str(WAV_MIME)
            .map_err(|e| SttError::Other(e.to_string()))?;
        let send = self.request_with(part, STREAM_REQUEST_TIMEOUT).send();
        let resp = tokio::select! {
            r = send => r.map_err(|e| SttError::Network(e.to_string()))?,
            _ = cancel.cancelled() => return Err(SttError::Other(CANCELLED_MESSAGE.into())),
        };
        Self::parse_response(resp).await
    }
}

#[async_trait::async_trait]
impl SttEngine for GroqStt {
    async fn transcribe(&self, samples: &[f32]) -> Result<String, SttError> {
        let wav = audio::encode_wav_16k_mono(samples).map_err(|e| SttError::Other(e.to_string()))?;
        let part = reqwest::multipart::Part::bytes(wav)
            .mime_str(WAV_MIME)
            .map_err(|e| SttError::Other(e.to_string()))?;
        let resp = self
            .request_with(part, self.timeout)
            .send()
            .await
            .map_err(|e| SttError::Network(e.to_string()))?;
        Self::parse_response(resp).await
    }
}

#[cfg(test)]
mod tests {
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
        let body = reqwest::Body::wrap_stream(futures_util::stream::iter(chunks));
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
            .transcribe_stream(reqwest::Body::wrap_stream(endless), cancel)
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
