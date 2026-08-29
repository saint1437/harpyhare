use crate::audio;
use crate::http::{self, Retryable, RetryPolicy};

/// The encoded WAV, held as a refcounted buffer so a retry clones a handle
/// instead of the recording.
///
/// `bytes` is not a direct dependency and `reqwest` does not re-export it, but
/// `tokio-util` does — and the whole graph resolves to a single `bytes`, so this
/// is the very type `reqwest::Body` is built from. Going through the re-export
/// keeps `Cargo.toml` unchanged and cannot drift into a second version of the
/// crate the way a separately declared dependency could.
type WavBytes = tokio_util::bytes::Bytes;

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

/// The per-request deadline for the streaming upload. It is the same value as
/// the client's read timeout, and single-sourced from there: the two have to
/// agree, or the request would be cut off by whichever is shorter.
const STREAM_REQUEST_TIMEOUT: std::time::Duration = http::STREAMING_READ_TIMEOUT;

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

impl GroqStt {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            base_url: GROQ_BASE_URL.into(),
            timeout: DEFAULT_REQUEST_TIMEOUT,
            // Cloned out of the process-wide pool, not built here: this
            // constructor runs again on every `stt_language`/`stt_translate`
            // change, and a fresh client would drop the warm Groq connections
            // each time.
            client: http::shared_streaming(),
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

    /// A connection pool of this engine's own. A seam for the tests, and it must
    /// stay one — production wants the shared pool `new` takes.
    ///
    /// The two situations are opposites. In the app there is exactly ONE Groq
    /// host, the pool is deliberately kept warm forever, and that is what takes
    /// a TLS handshake out of the "release the key → text" path. In the suite
    /// every test starts a `MockServer` on an EPHEMERAL port and drops it; the
    /// OS recycles those ports, and a process-wide pool then hands a later test
    /// an idle connection to a server that no longer exists. A multipart POST
    /// cannot be replayed on a second connection, so the request fails outright
    /// — measured at three flaky runs in twelve under CPU load, against none
    /// with a client per engine.
    #[cfg(test)]
    pub fn with_isolated_client(mut self) -> Self {
        self.client = http::build_client(STREAM_REQUEST_TIMEOUT);
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

    /// Takes the encoded WAV as a refcounted buffer so that a retry costs a
    /// pointer bump rather than a fresh copy of it. `Part::bytes` would have
    /// wanted an owned `Vec` back; `Body::from(Bytes)` builds the same reusable
    /// body from a handle — `Part::bytes` reaches it by the identical route,
    /// converting its `Vec` into `Bytes` first.
    async fn transcribe_once(&self, wav: WavBytes) -> Result<String, SttError> {
        let part = reqwest::multipart::Part::stream(reqwest::Body::from(wav))
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
        // `hound` walks the whole recording sample by sample — up to ~9.6 M of
        // them at the documented ten-minute ceiling — and this runs at the
        // moment the app is also draining capture events and opening the LLM
        // stream, so the encode goes to a blocking thread rather than parking a
        // Tokio worker. The port hands us a borrowed slice and `spawn_blocking`
        // needs `'static`, so the samples are copied in; that copy is a plain
        // memcpy and is an order of magnitude cheaper than the encode it moves
        // off the runtime.
        let owned = samples.to_vec();
        let wav = tokio::task::spawn_blocking(move || audio::encode_wav_16k_mono(&owned))
            .await
            .map_err(|e| SttError::Other(e.to_string()))?
            .map_err(|e| SttError::Other(e.to_string()))?;
        // One refcounted buffer for every attempt, the first included. The
        // former `wav.clone()` copied the entire encoded WAV — ~19 MB at that
        // same ceiling — per try, and paid it even when there was no retry.
        let wav = WavBytes::from(wav);
        http::retry_with_backoff(self.retry, |_| self.transcribe_once(wav.clone())).await
    }
}

#[cfg(test)]
mod tests;
