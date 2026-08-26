use serde::Serialize;
use std::collections::BTreeMap;

/// What went wrong, as a stable machine identifier.
///
/// The frontend owns every phrase the user reads; this enum is the only thing
/// that decides WHICH phrase, so a variant must never be renamed or reused for
/// a different event — exactly the discipline the proxy worker follows for its
/// own codes (`itech-relay/README.md`, «Коды ошибок»).
///
/// The first nine are the app's own vocabulary. The eight after them exist
/// because the worker distinguishes cases the app used to flatten into `api`
/// and then explain in a Russian sentence — which is precisely what a second
/// language cannot carry.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum ErrorCode {
    Network,
    BadApiKey,
    BadAccessCode,
    Retryable,
    Api,
    Cancelled,
    Permission,
    Silence,
    Internal,
    /// The request body is over the proxy's ceiling. `limitMb`.
    RequestTooLarge,
    /// The audio upload is over the proxy's ceiling. `limitMb`.
    AudioTooLong,
    /// The chosen model is outside the access code's allowlist. `model`.
    ModelNotAllowed,
    /// The access code's daily budget is spent; it comes back at UTC midnight.
    DailyLimitExceeded,
    /// Redeem attempts are rate limited. `retryAfterSeconds`.
    TooManyAttempts,
    /// The service owner's problem, not the user's: the proxy's own upstream
    /// key was refused or its balance ran out. Retrying changes nothing.
    ServiceUnavailable,
    /// The upstream could not be reached at all (DNS, TLS, an empty 200).
    ProviderUnreachable,
    /// The conversation no longer fits the model's context window.
    ContextTooLong,
}

/// Machine values the frontend cannot know on its own — a limit in megabytes, a
/// rejected model id, a wait in seconds — and nothing else.
///
/// `String → String` rather than a typed variant per code on purpose. The only
/// consumer is template substitution in `src/i18n`, where the placeholders
/// actually live; a typed Rust map would restate that placeholder set in a
/// second place, make every new code a breaking change to `bindings.ts`, and
/// still not be able to check the one thing that matters (a placeholder without
/// its parameter). `BTreeMap` and not `HashMap` so the JSON is deterministic
/// and a test can compare it literally.
///
/// **Never put a finished phrase in here.** The one deliberate exception is
/// [`param::DETAILS`], and it is not a phrase this app chose: it is somebody
/// else's text (an upstream error body, an OS message, an HTTP snippet) which
/// no dictionary can translate, quoted verbatim inside a localized frame.
pub type ErrorParams = BTreeMap<String, String>;

/// The parameter names. Written once here, matched by `src/i18n/errors.ts`.
pub mod param {
    /// A byte ceiling, already converted to whole megabytes.
    pub const LIMIT_MB: &str = "limitMb";
    /// The model id the proxy refused, raw and possibly empty.
    pub const MODEL: &str = "model";
    /// How long the caller must wait before trying again.
    pub const RETRY_AFTER_SECONDS: &str = "retryAfterSeconds";
    /// The HTTP status behind a retryable failure.
    pub const STATUS: &str = "status";
    /// Foreign text quoted inside the localized frame — see [`super::ErrorParams`].
    pub const DETAILS: &str = "details";
    /// Which upstream refused a key: `Anthropic` or `Groq`. A proper noun,
    /// identical in every language, which is why it travels as a value.
    pub const PROVIDER: &str = "provider";
    /// Which of [`super::subject`] this error is about.
    pub const SUBJECT: &str = "subject";
}

/// A machine sub-key inside a code.
///
/// Some codes cover several situations that need different words — `permission`
/// alone is system audio, the microphone and screen recording — and the app used
/// to tell them apart with a Russian sentence per site. A subject is that
/// distinction expressed as a value: the frontend resolves it through the
/// exhaustive `dict.errors.subjects`, so a subject added here without a
/// translation fails `tsc`, and `i18n/errors.test.ts` holds this list and that
/// record to each other.
///
/// The bar for a new subject is the same as for a new `ErrorCode`: the user
/// would be told something DIFFERENT. Anything the user cannot act on stays
/// `details`.
pub mod subject {
    /// macOS refused the system-audio tap.
    pub const SYSTEM_AUDIO_PERMISSION: &str = "systemAudioPermission";
    /// The tap could not be opened for a reason that is not a permission —
    /// the output device is the thing to check. The only case on Windows.
    pub const SYSTEM_AUDIO_DEVICE: &str = "systemAudioDevice";
    pub const MICROPHONE: &str = "microphone";
    pub const MICROPHONE_UNAVAILABLE: &str = "microphoneUnavailable";
    pub const SCREEN_RECORDING: &str = "screenRecording";
    /// Nothing was heard, on a platform where a permission could be the cause.
    pub const SILENCE_GATED: &str = "silenceGated";
    /// Nothing was heard, and only the device can explain it.
    pub const SILENCE_DEVICE: &str = "silenceDevice";
    /// The capture is held by somebody else.
    pub const PTT_BUSY: &str = "pttBusy";
    pub const AUTO_ACTIVE: &str = "autoActive";
    pub const CHECK_RUNNING: &str = "checkRunning";
    pub const CLIPBOARD_DECODE: &str = "clipboardDecode";
    pub const CLIPBOARD_WRITE: &str = "clipboardWrite";
    pub const UPDATE_INSTALLING: &str = "updateInstalling";
    pub const UPDATE_MISSING: &str = "updateMissing";
    pub const IMPORT_UNSUPPORTED: &str = "importUnsupported";
    pub const IMPORT_PDF_NO_TEXT: &str = "importPdfNoText";
    pub const IMPORT_PDF_PARSE: &str = "importPdfParse";
    /// Carries `limitMb` beside it.
    pub const IMPORT_TOO_LARGE: &str = "importTooLarge";
    pub const REDEEM_BAD_RESPONSE: &str = "redeemBadResponse";
    pub const REDEEM_EMPTY_TOKEN: &str = "redeemEmptyToken";
    pub const REDEEM_FAILED: &str = "redeemFailed";
    pub const REDEEM_UPSTREAM_DOWN: &str = "redeemUpstreamDown";
    pub const REDEEM_TOO_MANY: &str = "redeemTooMany";
    pub const REQUEST_TOO_LARGE: &str = "requestTooLarge";
    pub const STREAM_TRUNCATED: &str = "streamTruncated";

    /// Everything above, for the test that holds this list to the dictionary.
    pub const ALL: &[&str] = &[
        SYSTEM_AUDIO_PERMISSION,
        SYSTEM_AUDIO_DEVICE,
        MICROPHONE,
        MICROPHONE_UNAVAILABLE,
        SCREEN_RECORDING,
        SILENCE_GATED,
        SILENCE_DEVICE,
        PTT_BUSY,
        AUTO_ACTIVE,
        CHECK_RUNNING,
        CLIPBOARD_DECODE,
        CLIPBOARD_WRITE,
        UPDATE_INSTALLING,
        UPDATE_MISSING,
        IMPORT_UNSUPPORTED,
        IMPORT_PDF_NO_TEXT,
        IMPORT_PDF_PARSE,
        IMPORT_TOO_LARGE,
        REDEEM_BAD_RESPONSE,
        REDEEM_EMPTY_TOKEN,
        REDEEM_FAILED,
        REDEEM_UPSTREAM_DOWN,
        REDEEM_TOO_MANY,
        REQUEST_TOO_LARGE,
        STREAM_TRUNCATED,
    ];
}

/// One failure on its way to the user.
///
/// `code` + `params` are what the frontend renders from. `message` stays, and
/// stays Russian: it is what `Display` prints into the logs, and it is the
/// fallback the frontend shows when it meets a `code` it does not know — the
/// same compatibility rule the worker keeps for the builds already in users'
/// hands.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AppError {
    pub code: ErrorCode,
    pub message: String,
    #[serde(default)]
    pub params: ErrorParams,
}

impl AppError {
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            params: ErrorParams::new(),
        }
    }

    pub fn with_params(code: ErrorCode, message: impl Into<String>, params: ErrorParams) -> Self {
        Self {
            code,
            message: message.into(),
            params,
        }
    }

    /// The common shape: a code, the Russian sentence for the log, and the
    /// subject that tells the frontend WHICH phrase of that code to print.
    pub fn with_subject(code: ErrorCode, message: impl Into<String>, subject: &str) -> Self {
        Self::with_params(
            code,
            message,
            params_of([(param::SUBJECT, subject.to_string())]),
        )
    }
}

/// One parameter, without a `let mut` at every call site.
pub fn params_of<const N: usize>(pairs: [(&str, String); N]) -> ErrorParams {
    pairs.into_iter().map(|(k, v)| (k.to_string(), v)).collect()
}

/// The body only: the code already supplies the headline everywhere this is
/// shown, and the two concatenated read as a stutter.
impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}

pub trait CodedError: std::error::Error {
    fn code(&self) -> ErrorCode;

    /// The machine values that go with the code. Most errors have none, which
    /// is why this has a default body rather than a `None` variant everywhere.
    fn params(&self) -> ErrorParams {
        ErrorParams::new()
    }
}

impl<E: CodedError> From<&E> for AppError {
    fn from(err: &E) -> Self {
        Self::with_params(err.code(), err.to_string(), err.params())
    }
}

/// By-value conversions so the command layer can `?` a domain error straight
/// into its `Result<_, AppError>`. A blanket `impl<E: CodedError> From<E>`
/// would collide with the reflexive `From<AppError> for AppError`, so the
/// concrete types are listed; the body is the same `&E` conversion.
macro_rules! coded_error_into_app_error {
    ($($ty:path),+ $(,)?) => {$(
        impl From<$ty> for AppError {
            fn from(err: $ty) -> Self {
                Self::from(&err)
            }
        }
    )+};
}

coded_error_into_app_error!(
    crate::llm::LlmError,
    crate::stt::SttError,
    crate::capture::CaptureError,
);

/// An `io::Error` reaching the command layer is always a storage failure the
/// user can do nothing about — a code of its own would buy the frontend no new
/// branch, so it lands on `internal` with the OS text as the body. The OS text
/// is also handed over as `details`: it is not ours to translate, and without it
/// the English frame would have nothing concrete inside it.
impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        let text = err.to_string();
        Self::with_params(
            ErrorCode::Internal,
            text.clone(),
            params_of([(param::DETAILS, text)]),
        )
    }
}

/// Tauri's own failures (window creation, `run_on_main_thread`, a joined task
/// that panicked) have no domain of their own either.
pub fn internal(message: impl Into<String>) -> AppError {
    let text = message.into();
    AppError::with_params(
        ErrorCode::Internal,
        text.clone(),
        params_of([(param::DETAILS, text)]),
    )
}

#[cfg(test)]
mod tests;
