use futures_util::{SinkExt, StreamExt};
use tokio_tungstenite::tungstenite::{
    client::IntoClientRequest,
    http::{header::AUTHORIZATION, HeaderValue},
    Error as WsError, Message as WsMessage,
};

use crate::audio;
use super::{AudioChunkStream, Keyterms, SttEngine, SttError};

const BASE_URL: &str = "https://api.eu.deepgram.com";
const LISTEN_PATH: &str = "/v1/listen";
const PROJECTS_PATH: &str = "/v1/projects";
const MODEL: &str = "nova-3";
const MULTI_LANGUAGE: &str = "multi";
const DEFAULT_LANGUAGE: &str = "ru";
const WAV_MIME: &str = "audio/wav";
const CANCELLED_MESSAGE: &str = "отменено";
const WAV_HEADER_LEN: usize = 44;
const ERROR_BODY_LIMIT: usize = 300;
const REQUEST_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(60);
const WARM_UP_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(5);
const CLOSE_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(15);
const KEY_LABEL: &str = "Deepgram";
const KEYTERM_PARAM: &str = "keyterm";

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
            base_url: BASE_URL.into(),
            client: super::warm_pooled_client(),
            language: DEFAULT_LANGUAGE.into(),
        }
    }

    pub fn with_language(mut self, language: String) -> Self {
        self.language = language;
        self
    }

    #[cfg(test)]
    fn with_base_url(mut self, base_url: String) -> Self {
        self.base_url = base_url;
        self
    }

    fn language_param(&self) -> &str {
        let language = self.language.trim();
        if language.is_empty() { MULTI_LANGUAGE } else { language }
    }

    fn rest_request(&self, wav: Vec<u8>, keyterms: Keyterms<'_>) -> reqwest::RequestBuilder {
        let mut query: Vec<(&str, &str)> = vec![
            ("model", MODEL),
            ("language", self.language_param()),
            ("smart_format", "true"),
        ];
        query.extend(Self::keyterm_params(keyterms));
        self.client
            .post(format!("{}{}", self.base_url, LISTEN_PATH))
            .header("Authorization", format!("Token {}", self.api_key))
            .header(reqwest::header::CONTENT_TYPE, WAV_MIME)
            .query(&query)
            .body(wav)
            .timeout(REQUEST_TIMEOUT)
    }

    /// Термины уходят повторяющимся `keyterm=`, как требует Nova-3. Резать
    /// список здесь не надо: предел вендора уже применил `accepted()` реестра.
    fn keyterm_params(keyterms: Keyterms<'_>) -> Vec<(&str, &str)> {
        keyterms.iter().map(|term| (KEYTERM_PARAM, term.as_str())).collect()
    }

    /// Собираем через `Url`, а не форматированием: термины бывают многословными,
    /// и Deepgram требует их процентного кодирования — ручная склейка порвала бы
    /// запрос на первом же пробеле.
    fn websocket_url(&self, keyterms: Keyterms<'_>) -> String {
        let base = self.base_url.trim_end_matches('/');
        let ws_base = base
            .strip_prefix("https://")
            .map(|rest| format!("wss://{rest}"))
            .or_else(|| base.strip_prefix("http://").map(|rest| format!("ws://{rest}")))
            .unwrap_or_else(|| base.to_string());
        let endpoint = format!("{ws_base}{LISTEN_PATH}");
        let Ok(mut url) = reqwest::Url::parse(&endpoint) else {
            return endpoint;
        };
        {
            let mut query = url.query_pairs_mut();
            query.append_pair("model", MODEL);
            query.append_pair("language", self.language_param());
            query.append_pair("encoding", "linear16");
            query.append_pair("sample_rate", "16000");
            query.append_pair("channels", "1");
            query.append_pair("smart_format", "true");
            query.append_pair("punctuate", "true");
            for term in keyterms {
                query.append_pair(KEYTERM_PARAM, term);
            }
        }
        url.into()
    }

    fn websocket_request(
        &self,
        keyterms: Keyterms<'_>,
    ) -> Result<tokio_tungstenite::tungstenite::http::Request<()>, SttError> {
        let mut request = self
            .websocket_url(keyterms)
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
                    401 | 403 => SttError::BadApiKey(KEY_LABEL),
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
            Err(SttError::Other("Deepgram stream завершился без текста распознавания".into()))
        } else {
            Ok(text)
        }
    }

    async fn parse_rest_response(resp: reqwest::Response) -> Result<String, SttError> {
        match resp.status().as_u16() {
            200 => {
                let value: serde_json::Value = resp
                    .json()
                    .await
                    .map_err(|e| SttError::Other(format!("Deepgram: не удалось разобрать ответ: {e}")))?;
                value["results"]["channels"][0]["alternatives"][0]["transcript"]
                    .as_str()
                    .map(str::trim)
                    .filter(|text| !text.is_empty())
                    .map(str::to_string)
                    .ok_or_else(|| SttError::Other("Deepgram вернул ответ без текста распознавания".into()))
            }
            401 | 403 => Err(SttError::BadApiKey(KEY_LABEL)),
            code @ (429 | 500..=599) => Err(SttError::Retryable(code)),
            code => {
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
                        (!trimmed.is_empty()).then(|| trimmed.chars().take(ERROR_BODY_LIMIT).collect())
                    })
                    .unwrap_or_else(|| "ответ без тела".into());
                Err(SttError::Other(format!("Deepgram HTTP {code}: {message}")))
            }
        }
    }
}

#[async_trait::async_trait]
impl SttEngine for DeepgramStt {
    async fn transcribe_stream(
        &self,
        mut chunks: AudioChunkStream,
        keyterms: Keyterms<'_>,
        cancel: tokio_util::sync::CancellationToken,
    ) -> Result<String, SttError> {
        let request = self.websocket_request(keyterms)?;
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
                _ = cancel.cancelled() => return Err(SttError::Other(CANCELLED_MESSAGE.into())),
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
                        Some(Err(e)) => return Err(SttError::Network(format!("Deepgram WebSocket receive: {e}"))),
                        None => return Err(SttError::Network("Deepgram WebSocket закрылся до конца записи".into())),
                    }
                }
            }
        }

        writer
            .send(WsMessage::Text(serde_json::json!({"type": "CloseStream"}).to_string().into()))
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
                    Some(Err(e)) => return Err(SttError::Network(format!("Deepgram WebSocket receive: {e}"))),
                }
            }
        };

        match tokio::select! {
            _ = cancel.cancelled() => return Err(SttError::Other(CANCELLED_MESSAGE.into())),
            result = tokio::time::timeout(CLOSE_TIMEOUT, receive_final) => result,
        } {
            Ok(result) => result?,
            Err(_) if segments.is_empty() => {
                return Err(SttError::Network("Deepgram не завершил WebSocket после CloseStream".into()));
            }
            Err(_) => {}
        }

        Self::transcript_from_segments(&segments)
    }

    async fn warm_up(&self) {
        let _ = self
            .client
            .get(format!("{}{}", self.base_url, PROJECTS_PATH))
            .header("Authorization", format!("Token {}", self.api_key))
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
        let resp = self
            .rest_request(wav, keyterms)
            .send()
            .await
            .map_err(|e| SttError::Network(e.to_string()))?;
        Self::parse_rest_response(resp).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_language_uses_multi() {
        let stt = DeepgramStt::new("k".into()).with_language(String::new());
        assert_eq!(stt.language_param(), MULTI_LANGUAGE);
    }

    #[test]
    fn websocket_url_uses_eu_host_and_pcm_shape() {
        let stt = DeepgramStt::new("k".into());
        let url = stt.websocket_url(&[]);
        assert!(url.starts_with("wss://api.eu.deepgram.com/v1/listen?"));
        assert!(url.contains("model=nova-3"));
        assert!(url.contains("encoding=linear16"));
        assert!(url.contains("sample_rate=16000"));
    }

    /// Nova-3 принимает подсказки повторяющимся `keyterm=`; многословные термины
    /// обязаны быть закодированы, иначе запрос рвётся на первом же пробеле.
    #[test]
    fn keyterms_go_into_the_stream_url_encoded() {
        let stt = DeepgramStt::new("k".into());
        let terms = vec!["gRPC".to_string(), "Kubernetes Operator".to_string()];
        let url = stt.websocket_url(&terms);
        assert!(url.contains("keyterm=gRPC"), "{url}");
        assert!(url.contains("keyterm=Kubernetes+Operator"), "{url}");
    }

    #[test]
    fn no_keyterms_means_no_parameter() {
        assert!(!DeepgramStt::new("k".into()).websocket_url(&[]).contains("keyterm"));
    }

    #[test]
    fn final_results_are_joined() {
        let mut segments = Vec::new();
        DeepgramStt::consume_stream_text(
            &mut segments,
            r#"{"type":"Results","is_final":true,"channel":{"alternatives":[{"transcript":"привет"}]}}"#,
        )
        .unwrap();
        DeepgramStt::consume_stream_text(
            &mut segments,
            r#"{"type":"Results","is_final":true,"channel":{"alternatives":[{"transcript":"мир"}]}}"#,
        )
        .unwrap();
        assert_eq!(DeepgramStt::transcript_from_segments(&segments).unwrap(), "привет мир");
    }

    #[test]
    fn test_base_url_switches_ws_scheme() {
        let stt = DeepgramStt::new("k".into()).with_base_url("http://127.0.0.1:1234".into());
        assert!(stt.websocket_url(&[]).starts_with("ws://127.0.0.1:1234/v1/listen?"));
    }
}
