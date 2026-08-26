use serde_json::Value;
use std::time::Duration;

use crate::error::{AppError, CodedError, ErrorCode};
use crate::http::{self, Retryable, RetryPolicy};

const PROXY_BASE_URL: &str = "https://itech-relay.itech-edge.workers.dev";
#[cfg(debug_assertions)]
const PROXY_ENDPOINT_OVERRIDE_ENV: &str = "ITECH_PROXY_ENDPOINT";
#[cfg(debug_assertions)]
const HTTPS_PREFIX: &str = "https://";

const REDEEM_PATH: &str = "/v1/redeem";
const REDEEM_TIMEOUT: Duration = Duration::from_secs(15);

/// Retrying a redeem is safe because the request carries an `idempotency_key`:
/// the worker answers a repeat with the same token instead of burning a second
/// activation. That is precisely why a 5xx belongs in the retry set — the old
/// loop retried only transport failures and left the proxy's own hiccup to the
/// user, while the key that would have made it safe was already being sent.
const REDEEM_RETRY: RetryPolicy =
    RetryPolicy::new(3, Duration::from_millis(400), Duration::from_secs(4));

const REDEEM_BAD_RESPONSE: &str = "Прокси вернул неожиданный ответ на активацию";
const REDEEM_GENERIC_ERROR: &str = "Не удалось активировать код доступа";
const REDEEM_EMPTY_TOKEN: &str = "Прокси вернул пустой токен";
const REDEEM_TOO_MANY: &str = "Слишком много попыток активации — попробуйте позже";
const REDEEM_UPSTREAM_DOWN: &str = "Сервер активации недоступен — попробуйте позже";

/// The whole point of the type: the redeem form used to put «Код доступа не
/// принят» on top of every failure, including "no internet" and "too many
/// attempts, wait an hour". The code decides the headline now.
#[derive(Debug, thiserror::Error)]
pub enum AccessError {
    #[error("Нет соединения — проверь интернет/VPN: {0}")]
    Network(String),
    /// The worker looked at the code and said no.
    #[error("{0}")]
    Rejected(String),
    /// Rate limited or the upstream is unwell — the same code, later, works.
    #[error("{0}")]
    Retryable(String),
    #[error("{0}")]
    BadResponse(String),
    /// The worker named the failure itself — see `LlmError::Relay`. Redeem is
    /// the one call that ALWAYS goes to the proxy, so this is its normal path.
    #[error("{0}")]
    Relay(crate::llm::RelayErrorText),
}

impl AccessError {
    pub fn relay(error: crate::relay_error::RelayError) -> Self {
        AccessError::Relay(crate::llm::RelayErrorText(error))
    }
}

impl CodedError for AccessError {
    fn code(&self) -> ErrorCode {
        match self {
            AccessError::Network(_) => ErrorCode::Network,
            AccessError::Rejected(_) => ErrorCode::BadAccessCode,
            AccessError::Retryable(_) => ErrorCode::Retryable,
            AccessError::BadResponse(_) => ErrorCode::Api,
            AccessError::Relay(r) => r.0.code,
        }
    }

    fn params(&self) -> crate::error::ErrorParams {
        use crate::error::{param, params_of, ErrorParams};
        match self {
            AccessError::Network(text)
            | AccessError::Rejected(text)
            | AccessError::Retryable(text)
            | AccessError::BadResponse(text) => match fallback_subject(text) {
                // One of this module's OWN sentences: the frontend has a phrase
                // of its own for it and never has to print the Russian.
                Some(subject) => params_of([(param::SUBJECT, subject.to_string())]),
                // The worker's text, from a build that predates `code`. It is
                // quoted verbatim — the whole point of keeping `message`.
                None => params_of([(param::DETAILS, text.clone())]),
            },
            AccessError::Relay(r) => {
                if r.0.params.is_empty() {
                    ErrorParams::new()
                } else {
                    r.0.params.clone()
                }
            }
        }
    }
}

impl From<AccessError> for AppError {
    fn from(e: AccessError) -> Self {
        AppError::from(&e)
    }
}

impl Retryable for AccessError {
    fn should_retry(&self) -> bool {
        match self {
            AccessError::Network(_) | AccessError::Retryable(_) => true,
            AccessError::Relay(r) => r.0.should_retry(),
            _ => false,
        }
    }
}

pub fn proxy_base_url() -> String {
    #[cfg(debug_assertions)]
    {
        if let Ok(url) = std::env::var(PROXY_ENDPOINT_OVERRIDE_ENV) {
            let url = url.trim();
            if url.starts_with(HTTPS_PREFIX) {
                return url.to_string();
            }
        }
    }
    PROXY_BASE_URL.to_string()
}

#[derive(serde::Serialize)]
struct RedeemRequest<'a> {
    code: &'a str,
    idempotency_key: &'a str,
}

#[derive(serde::Deserialize)]
struct RedeemResponse {
    token: String,
}

pub async fn redeem(
    base_url: &str,
    code: &str,
    idempotency_key: &str,
) -> Result<String, AccessError> {
    let client = http::shared();
    let url = format!("{base_url}{REDEEM_PATH}");
    let payload = RedeemRequest {
        code: code.trim(),
        idempotency_key,
    };
    http::retry_with_backoff(REDEEM_RETRY, |_| {
        let client = client.clone();
        let url = url.clone();
        let payload = &payload;
        async move {
            let resp = client
                .post(&url)
                .timeout(REDEEM_TIMEOUT)
                .json(payload)
                .send()
                .await
                .map_err(|e| AccessError::Network(e.to_string()))?;
            parse_redeem(resp).await
        }
    })
    .await
}

async fn parse_redeem(resp: reqwest::Response) -> Result<String, AccessError> {
    let status = resp.status().as_u16();
    let body = resp.text().await.unwrap_or_default();
    if status != 200 {
        return Err(redeem_error(status, &body));
    }
    let token = serde_json::from_str::<RedeemResponse>(&body)
        .map(|r| r.token)
        .map_err(|_| AccessError::BadResponse(REDEEM_BAD_RESPONSE.into()))?;
    if token.trim().is_empty() {
        return Err(AccessError::BadResponse(REDEEM_EMPTY_TOKEN.into()));
    }
    Ok(token)
}

/// The inverse of the five constants above — see `context_import::to_app_error`
/// for the same shape and the same reason it is legitimate here.
fn fallback_subject(text: &str) -> Option<&'static str> {
    use crate::error::subject;
    match text {
        REDEEM_BAD_RESPONSE => Some(subject::REDEEM_BAD_RESPONSE),
        REDEEM_EMPTY_TOKEN => Some(subject::REDEEM_EMPTY_TOKEN),
        REDEEM_GENERIC_ERROR => Some(subject::REDEEM_FAILED),
        REDEEM_TOO_MANY => Some(subject::REDEEM_TOO_MANY),
        REDEEM_UPSTREAM_DOWN => Some(subject::REDEEM_UPSTREAM_DOWN),
        _ => None,
    }
}

fn body_message(body: &str) -> Option<String> {
    serde_json::from_str::<Value>(body)
        .ok()
        .and_then(|v| v["error"]["message"].as_str().map(str::to_string))
        .filter(|m| !m.trim().is_empty())
}

/// The worker's `code` decides the kind of failure whenever it is present; the
/// status-only branches below are what an older worker (or a Cloudflare error
/// page in front of it) still lands on, and they read `message` exactly as they
/// did before the coded protocol existed.
pub fn redeem_error(status: u16, body: &str) -> AccessError {
    if let Some(relay) = crate::relay_error::parse(body) {
        return AccessError::relay(relay);
    }
    let message = body_message(body);
    match status {
        429 => AccessError::Retryable(message.unwrap_or_else(|| REDEEM_TOO_MANY.into())),
        500..=599 => AccessError::Retryable(message.unwrap_or_else(|| REDEEM_UPSTREAM_DOWN.into())),
        _ => AccessError::Rejected(message.unwrap_or_else(|| REDEEM_GENERIC_ERROR.into())),
    }
}

#[cfg(test)]
mod tests;
