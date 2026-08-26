use crate::audio;
use crate::http::{self, Retryable, RetryPolicy};

const GROQ_BASE_URL: &str = "https://api.groq.com";
const TRANSCRIPTIONS_ENDPOINT: &str = "/openai/v1/audio/transcriptions";
const TRANSLATIONS_ENDPOINT: &str = "/openai/v1/audio/translations";
const WARM_UP_ENDPOINT: &str = "/openai/v1/models";

/// Whose key was refused — see `llm::PROVIDER_NAME`.
const PROVIDER_NAME: &str = "Groq";

const TRANSCRIBE_MODEL: &str = "whisper-large-v3-turbo";
const TRANSLATE_MODEL: &str = "whisper-large-v3";
const DEFAULT_LANGUAGE: &str = "ru";

const WAV_MIME: &str = "audio/wav";
const WAV_FILE_NAME: &str = "audio.wav";
const CANCELLED_MESSAGE: &str = "отменено";

const DEFAULT_REQUEST_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(60);
const WARM_UP_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(5);
const STREAM_REQUEST_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(11 * 60);

/// Only the buffered `transcribe` is retried. `transcribe_stream` cannot be:
/// its body is a one-shot channel of live microphone chunks, and there is
/// nothing left to send on a second attempt.
const TRANSCRIBE_RETRY: RetryPolicy =
    RetryPolicy::new(3, std::time::Duration::from_millis(400), std::time::Duration::from_secs(8));

#[derive(Debug, thiserror::Error)]
pub enum SttError {
    #[error("Неверный ключ Groq — проверь в настройках")]
    BadApiKey,
    #[error("{0}")]
    BadAccessCode(String),
    #[error("{1}")]
    Retryable(u16, String),
    #[error("Нет соединения — проверь интернет/VPN: {0}")]
    Network(String),
    #[error("{0}")]
    Other(String),
    /// The proxy worker named the failure itself — see `LlmError::Relay`.
    #[error("{0}")]
    Relay(crate::llm::RelayErrorText),
}

impl SttError {
    /// The wording used when Groq (or the proxy) gave no message of its own.
    pub fn retryable(status: u16) -> Self {
        SttError::Retryable(
            status,
            format!("Сервис распознавания перегружен, попробуй позже ({status})"),
        )
    }

    pub fn relay(error: crate::relay_error::RelayError) -> Self {
        SttError::Relay(crate::llm::RelayErrorText(error))
    }
}

impl Retryable for SttError {
    fn should_retry(&self) -> bool {
        match self {
            SttError::Retryable(..) | SttError::Network(_) => true,
            SttError::Relay(r) => r.0.should_retry(),
            _ => false,
        }
    }
}

impl crate::error::CodedError for SttError {
    fn code(&self) -> crate::error::ErrorCode {
        use crate::error::ErrorCode;
        match self {
            SttError::BadApiKey => ErrorCode::BadApiKey,
            SttError::BadAccessCode(_) => ErrorCode::BadAccessCode,
            SttError::Retryable(..) => ErrorCode::Retryable,
            SttError::Network(_) => ErrorCode::Network,
            SttError::Other(_) => ErrorCode::Api,
            SttError::Relay(r) => r.0.code,
        }
    }

    fn params(&self) -> crate::error::ErrorParams {
        use crate::error::{param, params_of};
        match self {
            SttError::Retryable(status, text) => params_of([
                (param::STATUS, status.to_string()),
                (param::DETAILS, text.clone()),
            ]),
            SttError::Network(text) | SttError::Other(text) | SttError::BadAccessCode(text) => {
                params_of([(param::DETAILS, text.clone())])
            }
            SttError::Relay(r) => r.0.params.clone(),
            SttError::BadApiKey => params_of([(param::PROVIDER, PROVIDER_NAME.to_string())]),
        }
    }
}

pub type AudioChunkStream =
    std::pin::Pin<Box<dyn futures_util::Stream<Item = Result<Vec<u8>, std::io::Error>> + Send>>;

#[async_trait::async_trait]
pub trait SttEngine: Send + Sync {
    async fn transcribe(&self, samples_16k_mono: &[f32]) -> Result<String, SttError>;
    async fn transcribe_stream(
        &self,
        chunks: AudioChunkStream,
        cancel: tokio_util::sync::CancellationToken,
    ) -> Result<String, SttError>;
    async fn warm_up(&self);
}

/// The one slot the STT engine lives in. Rebuilt whenever the key, the
/// language or the translation flag changes; cloned out of before every use, so
/// that no caller holds the lock across an `.await`.
pub struct SttService(std::sync::Mutex<std::sync::Arc<dyn SttEngine>>);

impl SttService {
    pub fn new(engine: std::sync::Arc<dyn SttEngine>) -> Self {
        Self(std::sync::Mutex::new(engine))
    }

    pub fn engine(&self) -> std::sync::Arc<dyn SttEngine> {
        use crate::sync::MutexExt;
        std::sync::Arc::clone(&*self.0.lock_safe())
    }

    pub fn replace(&self, engine: std::sync::Arc<dyn SttEngine>) {
        use crate::sync::MutexExt;
        *self.0.lock_safe() = engine;
    }
}

#[derive(Clone)]
pub struct GroqStt {
    api_key: String,
    base_url: String,
    timeout: std::time::Duration,
    client: reqwest::Client,
    language: String,
    translate: bool,
    proxy: bool,
    retry: RetryPolicy,
}

/// The streaming upload lives for the whole recording (up to ten minutes), so
/// this client cannot take the shared 60-second read timeout.
fn warm_pooled_client() -> reqwest::Client {
    http::build_client(STREAM_REQUEST_TIMEOUT)
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
            proxy: false,
            retry: TRANSCRIBE_RETRY,
        }
    }

    /// Tests that assert a status mapping do not want three attempts of it.
    pub fn with_retry(mut self, retry: RetryPolicy) -> Self {
        self.retry = retry;
        self
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
    pub fn with_proxy(mut self, proxy: bool) -> Self {
        self.proxy = proxy;
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

    /// The body is read once, and the worker's own `code` is consulted before
    /// the status — see `llm::require_ok_status` for the same reasoning.
    async fn parse_response(&self, resp: reqwest::Response) -> Result<String, SttError> {
        let status = resp.status().as_u16();
        if status == 200 {
            return Self::text_from_success(resp).await;
        }
        let body = resp.text().await.unwrap_or_default();
        if self.proxy {
            if let Some(relay) = crate::relay_error::parse(&body) {
                return Err(SttError::relay(relay));
            }
        }
        Err(match status {
            401 | 403 if self.proxy => {
                SttError::BadAccessCode(Self::message_from_body(status, &body))
            }
            401 | 403 => SttError::BadApiKey,
            429 | 500..=599 => Self::body_message(&body).map_or_else(
                || SttError::retryable(status),
                |m| SttError::Retryable(status, m),
            ),
            _ => SttError::Other(Self::message_from_body(status, &body)),
        })
    }

    async fn text_from_success(resp: reqwest::Response) -> Result<String, SttError> {
        let v: serde_json::Value = resp.json().await.map_err(|e| SttError::Other(e.to_string()))?;
        Ok(v["text"]
            .as_str()
            .ok_or_else(|| SttError::Other("ответ Groq без поля text".into()))?
            .trim()
            .to_string())
    }

    async fn transcribe_once(&self, wav: Vec<u8>) -> Result<String, SttError> {
        let part = reqwest::multipart::Part::bytes(wav)
            .mime_str(WAV_MIME)
            .map_err(|e| SttError::Other(e.to_string()))?;
        let resp = self
            .request_with(part, self.timeout)
            .send()
            .await
            .map_err(|e| SttError::Network(e.to_string()))?;
        self.parse_response(resp).await
    }

    fn body_message(body: &str) -> Option<String> {
        serde_json::from_str::<serde_json::Value>(body)
            .ok()?
            .get("error")?
            .get("message")?
            .as_str()
            .map(str::to_string)
            .filter(|m| !m.trim().is_empty())
    }

    fn message_from_body(code: u16, body: &str) -> String {
        Self::body_message(body).unwrap_or_else(|| format!("Groq HTTP {code}"))
    }

}

#[async_trait::async_trait]
impl SttEngine for GroqStt {
    async fn transcribe_stream(
        &self,
        chunks: AudioChunkStream,
        cancel: tokio_util::sync::CancellationToken,
    ) -> Result<String, SttError> {
        let part = reqwest::multipart::Part::stream(reqwest::Body::wrap_stream(chunks))
            .mime_str(WAV_MIME)
            .map_err(|e| SttError::Other(e.to_string()))?;
        let send = self.request_with(part, STREAM_REQUEST_TIMEOUT).send();
        let resp = tokio::select! {
            r = send => r.map_err(|e| SttError::Network(e.to_string()))?,
            _ = cancel.cancelled() => return Err(SttError::Other(CANCELLED_MESSAGE.into())),
        };
        self.parse_response(resp).await
    }

    async fn warm_up(&self) {
        let _ = self
            .client
            .get(format!("{}{}", self.base_url, WARM_UP_ENDPOINT))
            .timeout(WARM_UP_TIMEOUT)
            .send()
            .await;
    }

    async fn transcribe(&self, samples: &[f32]) -> Result<String, SttError> {
        let wav = audio::encode_wav_16k_mono(samples).map_err(|e| SttError::Other(e.to_string()))?;
        http::retry_with_backoff(self.retry, |_| self.transcribe_once(wav.clone())).await
    }
}

#[cfg(test)]
mod tests;
