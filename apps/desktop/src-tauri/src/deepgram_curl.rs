use std::fs;
use std::io::Write;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};

use crate::audio;
use crate::stt::{AudioChunkStream, SttEngine, SttError};

const DEEPGRAM_BASE_URL: &str = "https://api.eu.deepgram.com";
const DEEPGRAM_LISTEN_ENDPOINT: &str = "/v1/listen";
const DEEPGRAM_MODEL: &str = "nova-3";
const DEEPGRAM_MULTI_LANGUAGE: &str = "multi";
const WAV_MIME: &str = "audio/wav";
const CURL_CONNECT_TIMEOUT_SECS: &str = "5";
const CURL_REQUEST_TIMEOUT_SECS: &str = "30";
const HTTP_STATUS_MARKER: &str = "\n__HARPYHARE_HTTP_STATUS__:";
const ERROR_BODY_LIMIT: usize = 300;

static TEMP_FILE_SEQ: AtomicU64 = AtomicU64::new(0);

#[derive(Clone)]
pub struct DeepgramCurlStt {
    api_key: String,
    base_url: String,
    language: String,
}

impl DeepgramCurlStt {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            base_url: DEEPGRAM_BASE_URL.into(),
            language: "ru".into(),
        }
    }

    pub fn with_language(mut self, language: String) -> Self {
        self.language = language;
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

    fn listen_url(&self) -> Result<String, SttError> {
        let mut url = reqwest::Url::parse(&format!(
            "{}{}",
            self.base_url.trim_end_matches('/'),
            DEEPGRAM_LISTEN_ENDPOINT
        ))
        .map_err(|e| SttError::Other(format!("Deepgram URL: {e}")))?;
        url.query_pairs_mut()
            .append_pair("model", DEEPGRAM_MODEL)
            .append_pair("language", self.language_param())
            .append_pair("smart_format", "true");
        Ok(url.to_string())
    }

    async fn transcribe_wav(&self, wav: Vec<u8>) -> Result<String, SttError> {
        let api_key = self.api_key.clone();
        let url = self.listen_url()?;

        tokio::task::spawn_blocking(move || curl_transcribe(api_key, url, wav))
            .await
            .map_err(|e| SttError::Other(format!("Deepgram curl task: {e}")))?
    }
}

fn curl_transcribe(api_key: String, url: String, wav: Vec<u8>) -> Result<String, SttError> {
    let seq = TEMP_FILE_SEQ.fetch_add(1, Ordering::Relaxed);
    let wav_path = std::env::temp_dir().join(format!(
        "harpyhare-deepgram-{}-{seq}.wav",
        std::process::id()
    ));

    fs::write(&wav_path, wav)
        .map_err(|e| SttError::Other(format!("Deepgram: не удалось создать временный WAV: {e}")))?;

    let result = (|| {
        let data_arg = format!("@{}", wav_path.to_string_lossy());
        let mut child = Command::new("curl.exe")
            .arg("--silent")
            .arg("--show-error")
            .arg("--http1.1")
            .arg("--noproxy")
            .arg("*")
            .arg("--connect-timeout")
            .arg(CURL_CONNECT_TIMEOUT_SECS)
            .arg("--max-time")
            .arg(CURL_REQUEST_TIMEOUT_SECS)
            .arg("--request")
            .arg("POST")
            .arg(&url)
            .arg("--header")
            .arg("@-")
            .arg("--data-binary")
            .arg(data_arg)
            .arg("--write-out")
            .arg(format!("{HTTP_STATUS_MARKER}%{{http_code}}"))
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| {
                SttError::Network(format!(
                    "не удалось запустить встроенный в Windows curl.exe: {e}"
                ))
            })?;

        {
            let mut stdin = child.stdin.take().ok_or_else(|| {
                SttError::Other("Deepgram curl: stdin недоступен".into())
            })?;
            writeln!(stdin, "Authorization: Token {api_key}")
                .map_err(|e| SttError::Other(format!("Deepgram curl header: {e}")))?;
            writeln!(stdin, "Content-Type: {WAV_MIME}")
                .map_err(|e| SttError::Other(format!("Deepgram curl header: {e}")))?;
        }

        let output = child
            .wait_with_output()
            .map_err(|e| SttError::Network(format!("Deepgram curl: {e}")))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let detail = stderr.trim();
            let detail = if detail.is_empty() {
                format!("curl завершился с кодом {:?}", output.status.code())
            } else {
                detail.to_string()
            };
            return Err(SttError::Network(format!("Deepgram curl transport: {detail}")));
        }

        let stdout = String::from_utf8(output.stdout)
            .map_err(|e| SttError::Other(format!("Deepgram curl: ответ не UTF-8: {e}")))?;
        let (body, status) = stdout.rsplit_once(HTTP_STATUS_MARKER).ok_or_else(|| {
            SttError::Other("Deepgram curl: ответ без HTTP status marker".into())
        })?;
        let status = status
            .trim()
            .parse::<u16>()
            .map_err(|e| SttError::Other(format!("Deepgram curl: неверный HTTP status: {e}")))?;

        parse_deepgram_response(status, body)
    })();

    let _ = fs::remove_file(&wav_path);
    result
}

fn parse_deepgram_response(status: u16, body: &str) -> Result<String, SttError> {
    match status {
        200 => {
            let value: serde_json::Value = serde_json::from_str(body)
                .map_err(|e| SttError::Other(format!("Deepgram: не удалось разобрать ответ: {e}")))?;
            value["results"]["channels"][0]["alternatives"][0]["transcript"]
                .as_str()
                .map(str::trim)
                .filter(|text| !text.is_empty())
                .map(str::to_string)
                .ok_or_else(|| SttError::Other("Deepgram вернул ответ без текста распознавания".into()))
        }
        401 => Err(SttError::BadApiKey),
        code @ (429 | 500..=599) => Err(SttError::Retryable(code)),
        code => Err(SttError::Other(deepgram_error_message(code, body))),
    }
}

fn deepgram_error_message(code: u16, body: &str) -> String {
    let json = serde_json::from_str::<serde_json::Value>(body).ok();
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

#[async_trait::async_trait]
impl SttEngine for DeepgramCurlStt {
    async fn transcribe(&self, samples: &[f32]) -> Result<String, SttError> {
        let wav = audio::encode_wav_16k_mono(samples)
            .map_err(|e| SttError::Other(e.to_string()))?;
        self.transcribe_wav(wav).await
    }

    async fn transcribe_stream(
        &self,
        _chunks: AudioChunkStream,
        _cancel: tokio_util::sync::CancellationToken,
    ) -> Result<String, SttError> {
        Err(SttError::Other(
            "Deepgram streaming отключён: используется buffered batch transcription".into(),
        ))
    }

    async fn warm_up(&self) {}
}
