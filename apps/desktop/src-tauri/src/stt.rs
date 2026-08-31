use futures_util::{SinkExt, StreamExt};
use tokio_tungstenite::tungstenite::{
    client::IntoClientRequest,
    http::{header::AUTHORIZATION, HeaderValue},
    Error as WsError, Message as WsMessage,
};

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
    #[error("Неверный ключ распознавания — проверь в настройках")]
    BadApiKey,
    #[error("{0}")]
    BadAccessCode(String),
    #[error("Сервис распознавания перегружен, попробуй позже ({0})")]
    Retryable(u16),
    #[error("Нет соединения — проверь интернет: {0}")]
    Network(String),
    #[error("{0}")]
    Other(String),
}

impl crate::error::CodedError for SttError {
    fn code(&self) -> crate::error::ErrorCode {
        use crate::error::ErrorCode;
        match self {
            SttError::BadApiKey => ErrorCode::BadApiKey,
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

#[derive(Clone)]
pub struct GroqStt {
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
    pub fn with_proxy(mut self, proxy: bool) -> Self {
        self.proxy = proxy;
        self
    }
}

impl GroqStt {
    fn model(&self) -> &'static str {
        if self.translate {
            TRANSLATE_MODEL
        } else {
            TRANSCRIBE_MODEL
        }
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
        if self.translate {
            TRANSLATIONS_ENDPOINT
        } else {
            TRANSCRIPTIONS_ENDPOINT
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
            code @ (401 | 403) if self.proxy => Err(SttError::BadAccessCode(
                Self::message_from_body(code, resp).await,
            )),
            401 => Err(SttError::BadApiKey),
            403 => {
                let message = Self::message_from_body(403, resp).await;
                Err(SttError::Other(format!("Groq HTTP 403: {message}")))
            }
            code @ (429 | 500..=599) => Err(SttError::Retryable(code)),
            code => Err(SttError::Other(Self::message_from_body(code, resp).await)),
        }
    }

    async fn text_from_success(resp: reqwest::Response) -> Result<String, SttError> {
        let v: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| SttError::Other(e.to_string()))?;
        Ok(v["text"]
            .as_str()
            .ok_or_else(|| SttError::Other("ответ Groq без поля text".into()))?
            .trim()
            .to_string())
    }

    async fn message_from_body(code: u16, resp: reqwest::Response) -> String {
        let body = resp.text().await.unwrap_or_default();
        serde_json::from_str::<serde_json::Value>(&body)
            .ok()
            .and_then(|v| v["error"]["message"].as_str().map(str::to_string))
            .filter(|m| !m.trim().is_empty())
            .unwrap_or_else(|| format!("ответ без описания (HTTP {code})"))
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

const DEEPGRAM_BASE_URL: &str = "https://api.deepgram.com";
const DEEPGRAM_LISTEN_ENDPOINT: &str = "/v1/listen";
const DEEPGRAM_PROJECTS_ENDPOINT: &str = "/v1/projects";
const DEEPGRAM_MODEL: &str = "nova-3";
const DEEPGRAM_MULTI_LANGUAGE: &str = "multi";
const DEEPGRAM_CLOSE_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(15);
const WAV_HEADER_LEN: usize = 44;
const ERROR_BODY_LIMIT: usize = 300;

#[derive(Clone)]
pub struct DeepgramStt {
    api_key: String,
    base_url: String,
    client: reqwest::Client,
    language: String,
}

impl DeepgramStt {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            base_url: DEEPGRAM_BASE_URL.into(),
            client: warm_pooled_client(),
            language: DEFAULT_LANGUAGE.into(),
        }
    }

    pub fn with_language(mut self, language: String) -> Self {
        self.language = language;
        self
    }

    #[cfg(test)]
    pub fn with_base_url(mut self, url: String) -> Self {
        self.base_url = url;
        self
    }

    fn language_param(&self) -> &str {
        let language = self.language.trim();
        if language.is_empty() {
            DEEPGRAM_MULTI_LANGUAGE
        } else {
            language
        }
    }

    fn request(&self, wav: Vec<u8>) -> reqwest::RequestBuilder {
        self.client
            .post(format!("{}{}", self.base_url, DEEPGRAM_LISTEN_ENDPOINT))
            .header("Authorization", format!("Token {}", self.api_key))
            .header(reqwest::header::CONTENT_TYPE, WAV_MIME)
            .query(&[
                ("model", DEEPGRAM_MODEL),
                ("language", self.language_param()),
                ("smart_format", "true"),
            ])
            .body(wav)
            .timeout(DEFAULT_REQUEST_TIMEOUT)
    }

    fn websocket_url(&self) -> String {
        let base = self.base_url.trim_end_matches('/');
        let ws_base = base
            .strip_prefix("https://")
            .map(|rest| format!("wss://{rest}"))
            .or_else(|| base.strip_prefix("http://").map(|rest| format!("ws://{rest}")))
            .unwrap_or_else(|| base.to_string());
        format!(
            "{ws_base}{DEEPGRAM_LISTEN_ENDPOINT}?model={DEEPGRAM_MODEL}&language={}&encoding=linear16&sample_rate=16000&channels=1&smart_format=true&punctuate=true",
            self.language_param()
        )
    }

    fn websocket_request(
        &self,
    ) -> Result<tokio_tungstenite::tungstenite::http::Request<()>, SttError> {
        let mut request = self
            .websocket_url()
            .into_client_request()
            .map_err(|e| SttError::Other(format!("Deepgram WebSocket URL: {e}")))?;
        let auth = HeaderValue::from_bytes(format!("Token {}", self.api_key).as_bytes())
            .map_err(|e| SttError::Other(format!("Deepgram Authorization header: {e}")))?;
        request.headers_mut().insert(AUTHORIZATION, auth);
        Ok(request)
    }

    fn map_ws_connect_error(error: WsError) -> SttError {
        match error {
            WsError::Http(response) => {
                let code = response.status().as_u16();
                let detail = response
                    .headers()
                    .get("dg-error")
                    .and_then(|v| v.to_str().ok())
                    .filter(|v| !v.trim().is_empty())
                    .unwrap_or("не удалось открыть WebSocket");
                match code {
                    401 => SttError::BadApiKey,
                    code @ (429 | 500..=599) => SttError::Retryable(code),
                    _ => SttError::Other(format!("Deepgram WebSocket HTTP {code}: {detail}")),
                }
            }
            other => SttError::Network(format!("Deepgram WebSocket: {other}")),
        }
    }

    fn consume_stream_text(segments: &mut Vec<String>, raw: &str) -> Result<bool, SttError> {
        let value: serde_json::Value = serde_json::from_str(raw)
            .map_err(|e| SttError::Other(format!("Deepgram WebSocket JSON: {e}")))?;
        match value["type"].as_str() {
            Some("Results") => {
                if value["is_final"].as_bool().unwrap_or(false) {
                    if let Some(text) = value["channel"]["alternatives"][0]["transcript"]
                        .as_str()
                        .map(str::trim)
                        .filter(|text| !text.is_empty())
                    {
                        segments.push(text.to_string());
                    }
                }
                Ok(false)
            }
            Some("Metadata") => Ok(true),
            Some("Error") => {
                let message = value["description"]
                    .as_str()
                    .or_else(|| value["message"].as_str())
                    .or_else(|| value["error"].as_str())
                    .unwrap_or("неизвестная ошибка WebSocket");
                Err(SttError::Other(format!("Deepgram WebSocket: {message}")))
            }
            _ => Ok(false),
        }
    }

    fn transcript_from_segments(segments: &[String]) -> Result<String, SttError> {
        let text = segments.join(" ").trim().to_string();
        if text.is_empty() {
            Err(SttError::Other(
                "Deepgram stream завершился без текста распознавания".into(),
            ))
        } else {
            Ok(text)
        }
    }

    async fn transcribe_wav(&self, wav: Vec<u8>) -> Result<String, SttError> {
        let resp = self
            .request(wav)
            .send()
            .await
            .map_err(|e| SttError::Network(e.to_string()))?;
        self.parse_response(resp).await
    }

    async fn parse_response(&self, resp: reqwest::Response) -> Result<String, SttError> {
        match resp.status().as_u16() {
            200 => Self::text_from_success(resp).await,
            401 => Err(SttError::BadApiKey),
            code @ (429 | 500..=599) => Err(SttError::Retryable(code)),
            code => Err(SttError::Other(Self::message_from_body(code, resp).await)),
        }
    }

    async fn text_from_success(resp: reqwest::Response) -> Result<String, SttError> {
        let v: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| SttError::Other(format!("Deepgram: не удалось разобрать ответ: {e}")))?;
        v["results"]["channels"][0]["alternatives"][0]["transcript"]
            .as_str()
            .map(str::trim)
            .filter(|text| !text.is_empty())
            .map(str::to_string)
            .ok_or_else(|| SttError::Other("Deepgram вернул ответ без текста распознавания".into()))
    }

    async fn message_from_body(code: u16, resp: reqwest::Response) -> String {
        let body = resp.text().await.unwrap_or_default();
        let json = serde_json::from_str::<serde_json::Value>(&body).ok();
        let message = json
            .as_ref()
            .and_then(|v| {
                v["err_msg"]
                    .as_str()
                    .or_else(|| v["message"].as_str())
                    .or_else(|| v["error"]["message"].as_str())
            })
            .map(str::trim)
            .filter(|m| !m.is_empty())
            .map(str::to_string)
            .or_else(|| {
                let trimmed = body.trim();
                if trimmed.is_empty() {
                    None
                } else {
                    Some(trimmed.chars().take(ERROR_BODY_LIMIT).collect())
                }
            })
            .unwrap_or_else(|| "ответ без тела".into());
        format!("Deepgram HTTP {code}: {message}")
    }
}

#[async_trait::async_trait]
impl SttEngine for DeepgramStt {
    async fn transcribe_stream(
        &self,
        mut chunks: AudioChunkStream,
        cancel: tokio_util::sync::CancellationToken,
    ) -> Result<String, SttError> {
        let request = self.websocket_request()?;
        let connect = tokio_tungstenite::connect_async(request);
        let (socket, _) = tokio::select! {
            result = connect => result.map_err(Self::map_ws_connect_error)?,
            _ = cancel.cancelled() => return Err(SttError::Other(CANCELLED_MESSAGE.into())),
        };
        let (mut writer, mut reader) = socket.split();
        let mut segments = Vec::new();
        let mut first_chunk = true;

        loop {
            tokio::select! {
                _ = cancel.cancelled() => {
                    return Err(SttError::Other(CANCELLED_MESSAGE.into()));
                }
                item = chunks.next() => {
                    let Some(item) = item else { break };
                    let mut chunk = item.map_err(|e| SttError::Network(e.to_string()))?;
                    if first_chunk {
                        first_chunk = false;
                        if chunk.len() >= WAV_HEADER_LEN
                            && &chunk[0..4] == b"RIFF"
                            && &chunk[8..12] == b"WAVE"
                        {
                            chunk.drain(..WAV_HEADER_LEN);
                        }
                    }
                    if !chunk.is_empty() {
                        writer
                            .send(WsMessage::Binary(chunk.into()))
                            .await
                            .map_err(|e| SttError::Network(format!("Deepgram WebSocket send: {e}")))?;
                    }
                }
                incoming = reader.next() => {
                    match incoming {
                        Some(Ok(WsMessage::Text(text))) => {
                            let _ = Self::consume_stream_text(&mut segments, text.as_str())?;
                        }
                        Some(Ok(WsMessage::Ping(data))) => {
                            writer
                                .send(WsMessage::Pong(data))
                                .await
                                .map_err(|e| SttError::Network(format!("Deepgram WebSocket pong: {e}")))?;
                        }
                        Some(Ok(WsMessage::Close(frame))) => {
                            return Err(SttError::Network(format!(
                                "Deepgram WebSocket закрылся до конца записи: {frame:?}"
                            )));
                        }
                        Some(Ok(_)) => {}
                        Some(Err(e)) => {
                            return Err(SttError::Network(format!("Deepgram WebSocket receive: {e}")));
                        }
                        None => {
                            return Err(SttError::Network(
                                "Deepgram WebSocket закрылся до конца записи".into(),
                            ));
                        }
                    }
                }
            }
        }

        let close_stream = serde_json::json!({ "type": "CloseStream" }).to_string();
        writer
            .send(WsMessage::Text(close_stream.into()))
            .await
            .map_err(|e| SttError::Network(format!("Deepgram CloseStream: {e}")))?;

        let receive_final = async {
            loop {
                match reader.next().await {
                    Some(Ok(WsMessage::Text(text))) => {
                        if Self::consume_stream_text(&mut segments, text.as_str())? {
                            return Ok::<(), SttError>(());
                        }
                    }
                    Some(Ok(WsMessage::Ping(data))) => {
                        writer
                            .send(WsMessage::Pong(data))
                            .await
                            .map_err(|e| SttError::Network(format!("Deepgram WebSocket pong: {e}")))?;
                    }
                    Some(Ok(WsMessage::Close(_))) | None => return Ok(()),
                    Some(Ok(_)) => {}
                    Some(Err(e)) => {
                        return Err(SttError::Network(format!("Deepgram WebSocket receive: {e}")));
                    }
                }
            }
        };

        let close_result = tokio::select! {
            _ = cancel.cancelled() => return Err(SttError::Other(CANCELLED_MESSAGE.into())),
            result = tokio::time::timeout(DEEPGRAM_CLOSE_TIMEOUT, receive_final) => result,
        };
        match close_result {
            Ok(result) => result?,
            Err(_) if segments.is_empty() => {
                return Err(SttError::Network(
                    "Deepgram не завершил WebSocket после CloseStream".into(),
                ));
            }
            Err(_) => {}
        }

        Self::transcript_from_segments(&segments)
    }

    async fn warm_up(&self) {
        let _ = self
            .client
            .get(format!("{}{}", self.base_url, DEEPGRAM_PROJECTS_ENDPOINT))
            .header("Authorization", format!("Token {}", self.api_key))
            .timeout(WARM_UP_TIMEOUT)
            .send()
            .await;
    }

    async fn transcribe(&self, samples: &[f32]) -> Result<String, SttError> {
        let wav = audio::encode_wav_16k_mono(samples).map_err(|e| SttError::Other(e.to_string()))?;
        self.transcribe_wav(wav).await
    }
}

#[cfg(test)]
mod tests;
