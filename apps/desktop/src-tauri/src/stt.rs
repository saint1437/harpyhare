use crate::audio;

const GROQ_BASE_URL: &str = "https://api.groq.com";
const TRANSCRIPTIONS_ENDPOINT: &str = "/openai/v1/audio/transcriptions";
const TRANSLATIONS_ENDPOINT: &str = "/openai/v1/audio/translations";
const WARM_UP_ENDPOINT: &str = "/openai/v1/models";

const TRANSCRIBE_MODEL: &str = "whisper-large-v3-turbo";
const TRANSLATE_MODEL: &str = "whisper-large-v3";
const DEFAULT_LANGUAGE: &str = "ru";
const GROQ_KEY_LABEL: &str = "Groq";

const OPENAI_BASE_URL: &str = "https://api.openai.com";
const OPENAI_TRANSCRIPTIONS_ENDPOINT: &str = "/v1/audio/transcriptions";
const OPENAI_TRANSLATIONS_ENDPOINT: &str = "/v1/audio/translations";
const OPENAI_WARM_UP_ENDPOINT: &str = "/v1/models";

const OPENAI_TRANSCRIBE_MODEL: &str = "gpt-4o-mini-transcribe";
const OPENAI_TRANSLATE_MODEL: &str = "whisper-1";
const OPENAI_KEY_LABEL: &str = "OpenAI";

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
    #[error("Неверный ключ {0} — проверь в настройках")]
    BadApiKey(&'static str),
    #[error("{0}")]
    BadAccessCode(String),
    #[error("Сервис распознавания перегружен, попробуй позже ({0})")]
    Retryable(u16),
    #[error("Нет соединения — проверь интернет/VPN: {0}")]
    Network(String),
    #[error("{0}")]
    Other(String),
}

impl crate::error::CodedError for SttError {
    fn code(&self) -> crate::error::ErrorCode {
        use crate::error::ErrorCode;
        match self {
            SttError::BadApiKey(_) => ErrorCode::BadApiKey,
            SttError::BadAccessCode(_) => ErrorCode::BadAccessCode,
            SttError::Retryable(_) => ErrorCode::Retryable,
            SttError::Network(_) => ErrorCode::Network,
            SttError::Other(_) => ErrorCode::Api,
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

#[derive(Clone, Copy, PartialEq)]
enum SttVendor {
    Groq,
    OpenAi,
}

#[derive(Clone)]
pub struct SttHttpClient {
    vendor: SttVendor,
    api_key: String,
    base_url: String,
    timeout: std::time::Duration,
    client: reqwest::Client,
    language: String,
    translate: bool,
    proxy: bool,
}

fn warm_pooled_client() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent(crate::llm::APP_USER_AGENT)
        .connect_timeout(CONNECT_TIMEOUT)
        .pool_idle_timeout(None)
        .http2_keep_alive_interval(HTTP2_KEEP_ALIVE_INTERVAL)
        .http2_keep_alive_while_idle(true)
        .build()
        .expect("reqwest client")
}

impl SttHttpClient {
    fn with_vendor(vendor: SttVendor, api_key: String, base_url: &str) -> Self {
        Self {
            vendor,
            api_key,
            base_url: base_url.into(),
            timeout: DEFAULT_REQUEST_TIMEOUT,
            client: warm_pooled_client(),
            language: DEFAULT_LANGUAGE.into(),
            translate: false,
            proxy: false,
        }
    }

    pub fn groq(api_key: String) -> Self {
        Self::with_vendor(SttVendor::Groq, api_key, GROQ_BASE_URL)
    }

    pub fn openai(api_key: String) -> Self {
        Self::with_vendor(SttVendor::OpenAi, api_key, OPENAI_BASE_URL)
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

impl SttHttpClient {
    fn model(&self) -> &'static str {
        match (self.vendor, self.translate) {
            (SttVendor::Groq, false) => TRANSCRIBE_MODEL,
            (SttVendor::Groq, true) => TRANSLATE_MODEL,
            (SttVendor::OpenAi, false) => OPENAI_TRANSCRIBE_MODEL,
            (SttVendor::OpenAi, true) => OPENAI_TRANSLATE_MODEL,
        }
    }

    fn key_label(&self) -> &'static str {
        match self.vendor {
            SttVendor::Groq => GROQ_KEY_LABEL,
            SttVendor::OpenAi => OPENAI_KEY_LABEL,
        }
    }

    fn form_with(&self, part: reqwest::multipart::Part) -> reqwest::multipart::Form {
        let mut form = reqwest::multipart::Form::new()
            .part("file", part.file_name(WAV_FILE_NAME))
            .text("model", self.model())
            .text("response_format", "json");
        if self.vendor == SttVendor::Groq {
            form = form.text("temperature", "0");
        }
        if self.translate || self.language.is_empty() {
            return form;
        }
        form.text("language", self.language.clone())
    }

    fn endpoint(&self) -> &'static str {
        match (self.vendor, self.translate) {
            (SttVendor::Groq, false) => TRANSCRIPTIONS_ENDPOINT,
            (SttVendor::Groq, true) => TRANSLATIONS_ENDPOINT,
            (SttVendor::OpenAi, false) => OPENAI_TRANSCRIPTIONS_ENDPOINT,
            (SttVendor::OpenAi, true) => OPENAI_TRANSLATIONS_ENDPOINT,
        }
    }

    fn warm_up_endpoint(&self) -> &'static str {
        match self.vendor {
            SttVendor::Groq => WARM_UP_ENDPOINT,
            SttVendor::OpenAi => OPENAI_WARM_UP_ENDPOINT,
        }
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

    async fn parse_response(&self, resp: reqwest::Response) -> Result<String, SttError> {
        match resp.status().as_u16() {
            200 => Self::text_from_success(resp).await,
            code @ (401 | 403) if self.proxy => {
                Err(SttError::BadAccessCode(Self::message_from_body(code, resp).await))
            }
            401 | 403 => Err(SttError::BadApiKey(self.key_label())),
            code @ (429 | 500..=599) => Err(SttError::Retryable(code)),
            code => Err(SttError::Other(Self::message_from_body(code, resp).await)),
        }
    }

    async fn text_from_success(resp: reqwest::Response) -> Result<String, SttError> {
        let v: serde_json::Value = resp.json().await.map_err(|e| SttError::Other(e.to_string()))?;
        Ok(v["text"]
            .as_str()
            .ok_or_else(|| SttError::Other("ответ распознавания без поля text".into()))?
            .trim()
            .to_string())
    }

    async fn message_from_body(code: u16, resp: reqwest::Response) -> String {
        let body = resp.text().await.unwrap_or_default();
        serde_json::from_str::<serde_json::Value>(&body)
            .ok()
            .and_then(|v| v["error"]["message"].as_str().map(str::to_string))
            .filter(|m| !m.trim().is_empty())
            .unwrap_or_else(|| format!("распознавание: HTTP {code}"))
    }
}

#[async_trait::async_trait]
impl SttEngine for SttHttpClient {
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
            .get(format!("{}{}", self.base_url, self.warm_up_endpoint()))
            .timeout(WARM_UP_TIMEOUT)
            .send()
            .await;
    }

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
        self.parse_response(resp).await
    }
}

#[cfg(test)]
mod tests;
