//! The proxy worker's error vocabulary, translated into this app's `ErrorCode`.
//!
//! CROSS-REPO CONTRACT. Every failing response from `itech-relay` is
//! `{"error":{"code","message","params"}}`, where `code` is a stable machine
//! identifier, `message` is a Russian phrase kept for the signed builds that
//! predate `code`, and `params` holds machine values only. The registry lives
//! in `itech-relay/src/http/error-codes.ts`; the table below is this side of it.
//!
//! Three rules follow from the worker's own compatibility note, and breaking
//! any of them silently degrades the app against a deployed worker:
//!
//! * a body with **no** `code` is an old worker — fall back to the status-based
//!   branches that were here before, which read `message`;
//! * a body with an **unknown** `code` is a newer worker — keep the phrase it
//!   sent (as `message` and as `details`) under the generic `Api` code, never
//!   drop the response on the floor;
//! * never map two worker codes onto one app code when the app would give them
//!   different advice — that is what the new `ErrorCode` variants are for.

use serde_json::Value;

use crate::error::{param, ErrorCode, ErrorParams};

const ERROR_FIELD: &str = "error";
const CODE_FIELD: &str = "code";
const MESSAGE_FIELD: &str = "message";
const PARAMS_FIELD: &str = "params";

/// One parsed worker refusal.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RelayError {
    pub code: ErrorCode,
    /// The worker's own Russian sentence: logs, `Display`, and the last-resort
    /// text if this build's dictionary has nothing for the code.
    pub message: String,
    pub params: ErrorParams,
}

impl RelayError {
    /// Which of these are worth another attempt. `ServiceUnavailable` is not:
    /// the proxy owner's key or balance is the problem, and a retry only burns
    /// the user's patience. Neither is `DailyLimitExceeded` — it resets at UTC
    /// midnight, not in 400 milliseconds.
    pub fn should_retry(&self) -> bool {
        matches!(
            self.code,
            ErrorCode::Retryable | ErrorCode::Network | ErrorCode::ProviderUnreachable
        )
    }
}

/// The whole worker registry, as of `itech-relay` at 2026-08. Twenty-two codes.
///
/// `admin_bad_json` and `admin_revoke_target_required` are listed for
/// completeness only — they answer `/admin/*`, which is `scripts/admin.mjs` and
/// never this app; their English `message` would reach nobody.
const RELAY_CODES: &[(&str, ErrorCode)] = &[
    // The bearer token this app stores as `access_token` is gone or revoked;
    // the only 401 the worker ever emits. Same user action as a refused code.
    ("invalid_token", ErrorCode::BadAccessCode),
    ("redeem_failed", ErrorCode::BadAccessCode),
    // Nothing the user can act on: a route that does not exist, or a bug on
    // either side of the wire.
    ("not_found", ErrorCode::Api),
    ("internal_error", ErrorCode::Api),
    ("bad_request", ErrorCode::Api),
    ("malformed_json", ErrorCode::Api),
    ("empty_body", ErrorCode::Api),
    ("upstream_rejected", ErrorCode::Api),
    ("admin_bad_json", ErrorCode::Api),
    ("admin_revoke_target_required", ErrorCode::Api),
    // Size ceilings: the user removes attachments, or records less.
    ("request_too_large", ErrorCode::RequestTooLarge),
    ("audio_too_long", ErrorCode::AudioTooLong),
    ("context_too_long", ErrorCode::ContextTooLong),
    // Budget and rate.
    ("model_not_allowed", ErrorCode::ModelNotAllowed),
    ("daily_limit_exceeded", ErrorCode::DailyLimitExceeded),
    ("too_many_attempts", ErrorCode::TooManyAttempts),
    ("upstream_overloaded", ErrorCode::Retryable),
    // The user pressed Stop, or dropped the recording mid-upload.
    ("request_cancelled", ErrorCode::Cancelled),
    ("recording_cancelled", ErrorCode::Cancelled),
    // The far side.
    ("provider_unreachable", ErrorCode::ProviderUnreachable),
    ("upstream_unavailable", ErrorCode::ProviderUnreachable),
    ("service_misconfigured", ErrorCode::ServiceUnavailable),
];

fn map_code(code: &str) -> Option<ErrorCode> {
    RELAY_CODES.iter().find(|(name, _)| *name == code).map(|(_, mapped)| *mapped)
}

/// JSON scalars only. A nested object or an array in `params` would mean the
/// worker started sending structure the templates cannot substitute, and
/// dropping it beats printing `[object Object]` at the user.
fn scalar(value: &Value) -> Option<String> {
    match value {
        Value::String(s) => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        Value::Bool(b) => Some(b.to_string()),
        _ => None,
    }
}

fn read_params(error: &Value) -> ErrorParams {
    error
        .get(PARAMS_FIELD)
        .and_then(Value::as_object)
        .map(|map| {
            map.iter()
                .filter_map(|(k, v)| scalar(v).map(|v| (k.clone(), v)))
                .collect()
        })
        .unwrap_or_default()
}

/// `None` means "this body is not a coded worker error" — an old worker, a raw
/// upstream body, or not JSON at all. The caller keeps its previous behaviour.
pub fn parse(body: &str) -> Option<RelayError> {
    let value = serde_json::from_str::<Value>(body).ok()?;
    let error = value.get(ERROR_FIELD)?;
    let code = error.get(CODE_FIELD)?.as_str()?;
    if code.trim().is_empty() {
        return None;
    }
    let message = error
        .get(MESSAGE_FIELD)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let mut params = read_params(error);
    match map_code(code) {
        Some(mapped) => Some(RelayError { code: mapped, message, params }),
        // A code this build has never heard of. The worker promises `message`
        // is a real sentence, so it becomes both the log line and the quoted
        // detail inside whatever frame the dictionary puts around `api`.
        None => {
            if !message.trim().is_empty() {
                params.insert(param::DETAILS.to_string(), message.clone());
            }
            Some(RelayError { code: ErrorCode::Api, message, params })
        }
    }
}

#[cfg(test)]
mod tests;
