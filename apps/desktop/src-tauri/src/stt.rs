//! Speech-to-text: a shared multipart client plus vendor-specific transports.

use crate::audio;

/// Deepgram uses raw-WAV REST plus a real-time WebSocket, so it has its own
/// transport while still implementing the same `SttEngine` port.
pub mod deepgram;
/// The one table a vendor is declared in; its picker half is exported to the
/// frontend, its transport half deliberately is not.
pub mod registry;

const DEFAULT_LANGUAGE: &str = "ru";

const WAV_MIME: &str = "audio/wav";
const WAV_FILE_NAME: &str = "audio.wav";
const CANCELLED_MESSAGE: &str = "отменено";

const CONNECT_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(10);
const HTTP2_KEEP_ALIVE_INTERVAL: std::time::Duration = std::time::Duration::from_secs(30);
const HTTP2_KEEP_ALIVE_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(5);
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

pub type Keyterms<'a> = &'a [String];

#[async_trait::async_trait]
pub trait SttEngine: Send + Sync {
    async fn transcribe(
        &self,
        samples_16k_mono: &[f32],
        keyterms: Keyterms<'_>,
    ) -> Result<String, SttError>;
    async fn transcribe_stream(
        &self,
        chunks: AudioChunkStream,
        keyterms: Keyterms<'_>,
        cancel: tokio_util::sync::CancellationToken,
    ) -> Result<String, SttError>;
    async fn warm_up(&self);
}

#[derive(Clone)]
pub struct SttHttpClient {
    spec: &'static registry::SttProviderSpec,
    api_key: String,
    base_url: String,
    timeout: std::time::Duration,
    client: reqwest::Client,
    language: String,
    translate: bool,
    proxy: bool,
}

pub(crate) fn warm_pooled_client() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent(crate::llm::APP_USER_AGENT)
        .connect_timeout(CONNECT_TIMEOUT)
        .pool_idle_timeout(None)
        .http2_keep_alive_interval(HTTP2_KEEP_ALIVE_INTERVAL)
        .http2_keep_alive_timeout(HTTP2_KEEP_ALIVE_TIMEOUT)
        .http2_keep_alive_while_idle(true)
        .build()
        .expect("reqwest client")
}

impl SttHttpClient {
    pub fn for_provider(provider_id: &str, api_key: String) -> Self {
        Self::over(registry::resolve(provider_id), api_key)
    }

    fn over(spec: &'static registry::SttProviderSpec, api_key: String) -> Self {
        assert!(
            !matches!(spec.wire, registry::SttWire::Deepgram { .. }),
            "Deepgram has a dedicated transport"
        );
        Self {
            spec,
            api_key,
            base_url: spec.wire.base_url().into(),
            timeout: DEFAULT_REQUEST_TIMEOUT,
            client: warm_pooled_client(),
            language: DEFAULT_LANGUAGE.into(),
            translate: false,
            proxy: false,
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
    pub fn with_language(mut self, language: String) -> Self {
        self.language = language;
        self
    }
    pub fn with_translate(mut self, translate: bool) -> Self {
        self.translate = translate;
        self
    }
    fn translate(&self) -> bool {
        registry::effective_translate(self.spec, self.translate)
    }
    pub fn with_proxy(mut self, proxy: bool) -> Self {
        self.proxy = proxy;
        self
    }

    fn language_field(&self) -> Option<String> {
        if self.translate() || self.language.is_empty() { None } else { Some(self.language.clone()) }
    }

    fn with_keyterms(
        &self,
        form: reqwest::multipart::Form,
        keyterms: Keyterms<'_>,
    ) -> reqwest::multipart::Form {
        let accepted = self.spec.keyterms.accepted(keyterms);
        if accepted.is_empty() {
            return form;
        }
        match self.spec.keyterms {
            registry::SttKeyterms::Unsupported => form,
            registry::SttKeyterms::Repeated { field, .. } => accepted
                .iter()
                .fold(form, |acc, term| acc.text(field, term.clone())),
            registry::SttKeyterms::Prompt { field } => form.text(field, accepted.join(", ")),
        }
    }

    fn form_with(
        &self,
        part: reqwest::multipart::Part,
        keyterms: Keyterms<'_>,
    ) -> reqwest::multipart::Form {
        let file = part.file_name(WAV_FILE_NAME);
        match self.spec.wire {
            registry::SttWire::OpenAiMultipart {
                transcribe_model,
                translate_model,
                temperature,
                ..
            } => {
                let model = if self.translate() { translate_model } else { transcribe_model };
                let mut form = reqwest::multipart::Form::new()
                    .part("file", file)
                    .text("model", model)
                    .text("response_format", "json");
                if let Some(temperature) = temperature {
                    form = form.text("temperature", temperature);
                }
                let form = match self.language_field() {
                    Some(language) => form.text("language", language),
                    None => form,
                };
                self.with_keyterms(form, keyterms)
            }
            registry::SttWire::Xai { .. } => {
                let form = reqwest::multipart::Form::new();
                let form = match self.language_field() {
                    Some(language) => form.text("language", language),
                    None => form,
                };
                self.with_keyterms(form, keyterms).part("file", file)
            }
            registry::SttWire::Deepgram { .. } => unreachable!("dedicated Deepgram transport"),
        }
    }

    fn request_with(
        &self,
        part: reqwest::multipart::Part,
        keyterms: Keyterms<'_>,
        timeout: std::time::Duration,
    ) -> reqwest::RequestBuilder {
        self.client
            .post(format!("{}{}", self.base_url, self.spec.wire.path(self.translate())))
            .bearer_auth(&self.api_key)
            .multipart(self.form_with(part, keyterms))
            .timeout(timeout)
    }

    async fn parse_response(&self, resp: reqwest::Response) -> Result<String, SttError> {
        match resp.status().as_u16() {
            200 => Self::text_from_success(resp).await,
            code @ (401 | 403) if self.proxy => {
                Err(SttError::BadAccessCode(Self::message_from_body(code, resp).await))
            }
            401 | 403 => Err(SttError::BadApiKey(self.spec.key_label)),
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
        keyterms: Keyterms<'_>,
        cancel: tokio_util::sync::CancellationToken,
    ) -> Result<String, SttError> {
        let part = reqwest::multipart::Part::stream(reqwest::Body::wrap_stream(chunks))
            .mime_str(WAV_MIME)
            .map_err(|e| SttError::Other(e.to_string()))?;
        let send = self.request_with(part, keyterms, STREAM_REQUEST_TIMEOUT).send();
        let resp = tokio::select! {
            r = send => r.map_err(|e| SttError::Network(e.to_string()))?,
            _ = cancel.cancelled() => return Err(SttError::Other(CANCELLED_MESSAGE.into())),
        };
        self.parse_response(resp).await
    }

    async fn warm_up(&self) {
        let _ = self
            .client
            .get(format!("{}{}", self.base_url, self.spec.wire.warm_up_path()))
            .timeout(WARM_UP_TIMEOUT)
            .send()
            .await;
    }

    async fn transcribe(
        &self,
        samples: &[f32],
        keyterms: Keyterms<'_>,
    ) -> Result<String, SttError> {
        let wav = audio::encode_wav_16k_mono(samples).map_err(|e| SttError::Other(e.to_string()))?;
        let part = reqwest::multipart::Part::bytes(wav)
            .mime_str(WAV_MIME)
            .map_err(|e| SttError::Other(e.to_string()))?;
        let resp = self
            .request_with(part, keyterms, self.timeout)
            .send()
            .await
            .map_err(|e| SttError::Network(e.to_string()))?;
        self.parse_response(resp).await
    }
}

#[cfg(test)]
mod tests;
