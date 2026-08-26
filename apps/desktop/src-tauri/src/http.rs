//! One HTTP client configuration and one retry policy for every outbound call.
//!
//! Before this module there were four different clients: `llm`/`stt` built warm
//! pooled ones, while `access::redeem` and `remote_presets::fetch_raw` built a
//! brand-new `reqwest::Client` **per call** — a fresh connection pool, a fresh
//! TLS handshake and (for redeem) no `User-Agent`, which is what Cloudflare's
//! Browser Integrity Check answers with `403 error code: 1010`.
//!
//! The retry half is the other missing piece: `LlmError::Retryable` and
//! `SttError::Retryable` were produced and never handled, so a 429 or a 503 went
//! straight to the user and the retry was a human pressing a button. All that
//! traffic goes through a single proxy worker, so a degraded upstream turned
//! into a thundering herd of hand-pressed retries.

use std::sync::OnceLock;
use std::time::Duration;

pub const APP_USER_AGENT: &str = concat!("AudioSystem/", env!("CARGO_PKG_VERSION"));

const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const HTTP2_KEEP_ALIVE_INTERVAL: Duration = Duration::from_secs(30);
pub const DEFAULT_READ_TIMEOUT: Duration = Duration::from_secs(60);

static SHARED: OnceLock<reqwest::Client> = OnceLock::new();

/// The single place the client is configured. `read_timeout` is a client-level
/// setting in reqwest (there is no per-request equivalent), which is why the two
/// long-lived callers that need a different one build their own client from this
/// same builder rather than from their own recipe.
pub fn client_builder(read_timeout: Duration) -> reqwest::ClientBuilder {
    reqwest::Client::builder()
        .user_agent(APP_USER_AGENT)
        .connect_timeout(CONNECT_TIMEOUT)
        .read_timeout(read_timeout)
        .pool_idle_timeout(None)
        .http2_keep_alive_interval(HTTP2_KEEP_ALIVE_INTERVAL)
        .http2_keep_alive_while_idle(true)
}

/// Falls back to a default client rather than panicking: a `reqwest::Client`
/// only fails to build when the TLS backend cannot be initialised, and an app
/// that cannot reach the network is still an app that must start and say so.
pub fn build_client(read_timeout: Duration) -> reqwest::Client {
    client_builder(read_timeout).build().unwrap_or_else(|e| {
        eprintln!("не удалось собрать http-клиент ({e}); используется клиент по умолчанию");
        reqwest::Client::new()
    })
}

/// The process-wide warm client. Cloning it shares the pool, so short-lived
/// callers (redeem, the presets refresh) stop paying for a handshake each time.
pub fn shared() -> reqwest::Client {
    SHARED
        .get_or_init(|| build_client(DEFAULT_READ_TIMEOUT))
        .clone()
}

/// An error a second attempt could plausibly get past: a transport failure or an
/// upstream that said "later" (429/5xx). Anything the server decided about the
/// request itself — a bad key, a rejected code, a 400 — is not retried.
pub trait Retryable {
    fn should_retry(&self) -> bool;
}

#[derive(Debug, Clone, Copy)]
pub struct RetryPolicy {
    pub attempts: u32,
    pub base_delay: Duration,
    pub max_delay: Duration,
}

impl RetryPolicy {
    pub const fn new(attempts: u32, base_delay: Duration, max_delay: Duration) -> Self {
        Self {
            attempts,
            base_delay,
            max_delay,
        }
    }
}

/// Full jitter over an exponential backoff. Without the jitter every client that
/// hit the same 503 comes back in the same millisecond — which is the herd the
/// backoff is supposed to break up. The entropy source is the clock rather than
/// a `rand` dependency: the requirement is "different across processes and
/// across attempts", not cryptographic quality.
pub fn backoff_delay(policy: RetryPolicy, attempt: u32) -> Duration {
    let exponential = policy
        .base_delay
        .saturating_mul(1u32 << attempt.min(16))
        .min(policy.max_delay);
    let nanos = exponential.as_nanos() as u64;
    if nanos == 0 {
        return exponential;
    }
    let entropy = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.subsec_nanos() as u64);
    // Half the window is fixed so a retry never comes back instantly.
    Duration::from_nanos(nanos / 2 + entropy % (nanos / 2 + 1))
}

/// Runs `op` until it succeeds, returns a non-retryable error, or runs out of
/// attempts. The operation takes the attempt number so a caller can log it.
///
/// **Never wrap a stream that has already produced output in this.** A retried
/// LLM stream would replay the answer from the beginning on top of the deltas
/// the user is already reading; `llm::stream` therefore only retries while its
/// sink has seen nothing.
pub async fn retry_with_backoff<T, E, F, Fut>(policy: RetryPolicy, mut op: F) -> Result<T, E>
where
    F: FnMut(u32) -> Fut,
    Fut: std::future::Future<Output = Result<T, E>>,
    E: Retryable,
{
    let mut attempt = 0;
    loop {
        match op(attempt).await {
            Ok(value) => return Ok(value),
            Err(e) => {
                attempt += 1;
                if attempt >= policy.attempts || !e.should_retry() {
                    return Err(e);
                }
                tokio::time::sleep(backoff_delay(policy, attempt - 1)).await;
            }
        }
    }
}

#[cfg(test)]
mod tests;
