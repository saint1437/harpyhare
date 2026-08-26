//! The three strings the frontend must never see.
//!
//! They used to be ordinary `Settings` fields, which meant `get_settings`
//! handed both API keys and the paid access token to the webview **in
//! plaintext on every call**. The app renders untrusted content by
//! construction — a model answer becomes markdown becomes HTML, plus the HTML
//! preview — so any injection into either window collected all three secrets
//! with one `invoke`.
//!
//! The split is therefore a type split, not a filter: `Settings` no longer has
//! the fields to leak, and what crosses the boundary is [`SecretsStatus`] —
//! three booleans and a masked tail. The values themselves live here, are read
//! only by `app_state::build_stt_client` / `build_llm_client`, and are written
//! only through [`SecretsStore::update`].
//!
//! On disk they get their own file next to `settings.json`, written by the same
//! `write_atomic_owner_only` (mode `0600` on unix, an owner-only DACL on
//! Windows) — a separate file that anyone could read would move the problem
//! rather than solve it.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use crate::settings::{self, SettingsError, SettingsRecovery};
use crate::sync::MutexExt;

pub const SECRETS_FILE_NAME: &str = "secrets.json";

/// `secrets.json` is born at version 1 — there is no older shape of this file.
/// Everything that predates it lives inside `settings.json` and is picked up by
/// [`load_or_migrate`], not by a migration chain of its own.
pub const CURRENT_SCHEMA_VERSION: u32 = 1;

const ANTHROPIC_KEY_FIELD: &str = "anthropic_api_key";
const GROQ_KEY_FIELD: &str = "groq_api_key";
const ACCESS_TOKEN_FIELD: &str = "access_token";

/// The names the three secrets had while they were `Settings` fields. Read by
/// [`load_or_migrate`] out of an old document and deleted from it by
/// `settings::migrate_v1_to_v2`.
pub const LEGACY_SETTINGS_FIELDS: [&str; 3] =
    [ANTHROPIC_KEY_FIELD, GROQ_KEY_FIELD, ACCESS_TOKEN_FIELD];

/* ── masking ──────────────────────────────────────────────────────────────── */

const MASK_ELLIPSIS: char = '…';
const MASK_HEAD_CHARS: usize = 3;
const MASK_TAIL_CHARS: usize = 4;
/// Below this length nothing but the ellipsis is shown. A hint exists so the
/// user can tell WHICH key is stored, and revealing seven characters of a
/// ten-character string would be a leak wearing a hint's clothes.
const MASK_MIN_CHARS: usize = 12;

/// `sk-ant-api03-…9f2a` → `sk-…9f2a`. Empty in, empty out: the settings screen
/// shows the hint only where there is a key to hint at.
pub fn mask_secret(value: &str) -> String {
    let value = value.trim();
    if value.is_empty() {
        return String::new();
    }
    let chars: Vec<char> = value.chars().collect();
    if chars.len() < MASK_MIN_CHARS {
        return MASK_ELLIPSIS.to_string();
    }
    let head: String = chars[..MASK_HEAD_CHARS].iter().collect();
    let tail: String = chars[chars.len() - MASK_TAIL_CHARS..].iter().collect();
    format!("{head}{MASK_ELLIPSIS}{tail}")
}

/* ── the values ───────────────────────────────────────────────────────────── */

/// Which of the two user-supplied keys a write is about. The access token is
/// deliberately NOT a variant: it is issued by the proxy through
/// `redeem_access_code` and can only be cleared, never typed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum ApiKeyKind {
    Anthropic,
    Groq,
}

/// The secrets themselves. **Deliberately not `specta::Type`**: a type the
/// bindings generator cannot see is a type no command can return by accident.
#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct Secrets {
    pub schema_version: u32,
    pub anthropic_api_key: String,
    pub groq_api_key: String,
    pub access_token: String,
}

impl Default for Secrets {
    fn default() -> Self {
        Self {
            schema_version: CURRENT_SCHEMA_VERSION,
            anthropic_api_key: String::new(),
            groq_api_key: String::new(),
            access_token: String::new(),
        }
    }
}

/// Masked, because `Debug` output ends up in `eprintln!` and in panic messages,
/// and a secret printed there is a secret in the user's terminal and in every
/// log file that catches stderr.
impl std::fmt::Debug for Secrets {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Secrets")
            .field("schema_version", &self.schema_version)
            .field(ANTHROPIC_KEY_FIELD, &mask_secret(&self.anthropic_api_key))
            .field(GROQ_KEY_FIELD, &mask_secret(&self.groq_api_key))
            .field(ACCESS_TOKEN_FIELD, &mask_secret(&self.access_token))
            .finish()
    }
}

/// Everything about the secrets the frontend is allowed to know: whether each
/// one is there, and enough of a tail to tell two keys apart.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, specta::Type)]
pub struct SecretsStatus {
    pub anthropic_key_set: bool,
    pub groq_key_set: bool,
    pub access_code_active: bool,
    /// `sk-…9f2a`, or `""` when no key is stored.
    pub anthropic_key_hint: String,
    pub groq_key_hint: String,
}

impl Secrets {
    pub fn key(&self, kind: ApiKeyKind) -> &str {
        match kind {
            ApiKeyKind::Anthropic => &self.anthropic_api_key,
            ApiKeyKind::Groq => &self.groq_api_key,
        }
    }

    fn key_mut(&mut self, kind: ApiKeyKind) -> &mut String {
        match kind {
            ApiKeyKind::Anthropic => &mut self.anthropic_api_key,
            ApiKeyKind::Groq => &mut self.groq_api_key,
        }
    }

    /// «Замена, не редактирование»: an empty value means "leave what is stored
    /// alone", never "erase it". The field on screen starts blank on every
    /// visit — a form that saved its own emptiness wiped a working key every
    /// time the user opened the settings and changed something else.
    pub fn set_key(&mut self, kind: ApiKeyKind, value: &str) {
        let value = value.trim();
        if value.is_empty() {
            return;
        }
        *self.key_mut(kind) = value.to_string();
    }

    pub fn clear_key(&mut self, kind: ApiKeyKind) {
        self.key_mut(kind).clear();
    }

    pub fn clear_access_token(&mut self) {
        self.access_token.clear();
    }

    pub fn has_access_token(&self) -> bool {
        !self.access_token.trim().is_empty()
    }

    pub fn is_empty(&self) -> bool {
        !self.has_access_token()
            && self.anthropic_api_key.trim().is_empty()
            && self.groq_api_key.trim().is_empty()
    }

    pub fn status(&self) -> SecretsStatus {
        SecretsStatus {
            anthropic_key_set: !self.anthropic_api_key.trim().is_empty(),
            groq_key_set: !self.groq_api_key.trim().is_empty(),
            access_code_active: self.has_access_token(),
            anthropic_key_hint: mask_secret(&self.anthropic_api_key),
            groq_key_hint: mask_secret(&self.groq_api_key),
        }
    }

    /// `.env` fills in what the user has not typed — a developer convenience
    /// that must never override a stored key. Skipped wholesale under an access
    /// token, because the token silences both keys anyway and a stray
    /// `ANTHROPIC_API_KEY` in the environment would otherwise look "configured"
    /// while nothing uses it.
    pub fn apply_key_fallback(&mut self, anthropic: Option<String>, groq: Option<String>) {
        if self.has_access_token() {
            return;
        }
        fn fill_if_empty(target: &mut String, candidate: Option<String>) {
            if !target.is_empty() {
                return;
            }
            if let Some(v) = candidate {
                let v = v.trim();
                if !v.is_empty() {
                    *target = v.to_string();
                }
            }
        }
        fill_if_empty(&mut self.anthropic_api_key, anthropic);
        fill_if_empty(&mut self.groq_api_key, groq);
    }

    pub fn save(&self, path: &Path) -> std::io::Result<()> {
        let json = serde_json::to_string_pretty(self)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
        settings::write_atomic_owner_only(path, &json)
    }

    pub fn parse(raw: &str) -> Result<Self, SettingsError> {
        serde_json::from_str(raw).map_err(|e| SettingsError::Corrupt(e.to_string()))
    }
}

/* ── loading, and the one-way move out of settings.json ───────────────────── */

/// What the startup read found. The two flags are separate on purpose: a
/// `secrets.json` that already exists wins over stale fields left in
/// `settings.json`, but those fields still have to be scrubbed.
pub struct SecretsLoad {
    pub secrets: Secrets,
    /// The values came out of a pre-split `settings.json`; `secrets.json` does
    /// not exist yet and has to be written before anything else touches it.
    pub needs_write: bool,
    /// `settings.json` still carries at least one of the three fields and must
    /// be rewritten without them, whether or not it was the source.
    pub settings_needs_rewrite: bool,
    /// A `secrets.json` that could not be parsed was renamed aside; the user
    /// paid for the access code that was in it and has to be told.
    pub recovery: Option<SettingsRecovery>,
}

struct LegacyFields {
    present: bool,
    secrets: Secrets,
}

fn legacy_fields(settings_path: &Path) -> LegacyFields {
    let empty = LegacyFields { present: false, secrets: Secrets::default() };
    let Ok(raw) = std::fs::read_to_string(settings_path) else {
        return empty;
    };
    let Ok(value) = serde_json::from_str::<serde_json::Value>(&raw) else {
        return empty;
    };
    let Some(object) = value.as_object() else {
        return empty;
    };
    let present = LEGACY_SETTINGS_FIELDS.iter().any(|field| object.contains_key(*field));
    let read = |field: &str| {
        object
            .get(field)
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default()
            .trim()
            .to_string()
    };
    LegacyFields {
        present,
        secrets: Secrets {
            schema_version: CURRENT_SCHEMA_VERSION,
            anthropic_api_key: read(ANTHROPIC_KEY_FIELD),
            groq_api_key: read(GROQ_KEY_FIELD),
            access_token: read(ACCESS_TOKEN_FIELD),
        },
    }
}

/// Three outcomes, like `settings::load_or_recover`: `secrets.json` parsed →
/// use it; absent → look for the fields in the old `settings.json` so an update
/// does not log the user out; unreadable → the bytes are renamed out of the way
/// and reported, and the legacy file is still consulted.
pub fn load_or_migrate(secrets_path: &Path, settings_path: &Path) -> SecretsLoad {
    let legacy = legacy_fields(settings_path);
    let mut recovery = None;

    match std::fs::read_to_string(secrets_path) {
        Ok(raw) => match Secrets::parse(&raw) {
            Ok(secrets) => {
                return SecretsLoad {
                    secrets,
                    needs_write: false,
                    settings_needs_rewrite: legacy.present,
                    recovery: None,
                };
            }
            Err(e) => recovery = Some(settings::quarantine(secrets_path, e.to_string())),
        },
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => eprintln!("секреты не читаются ({e}); будут взяты значения по умолчанию"),
    }

    SecretsLoad {
        needs_write: !legacy.secrets.is_empty(),
        settings_needs_rewrite: legacy.present,
        secrets: legacy.secrets,
        recovery,
    }
}

/* ── the store ────────────────────────────────────────────────────────────── */

/// Both halves of an applied write — `old` decides which client has to be
/// rebuilt (see `preferences::secrets_effects`), `new` answers the frontend.
#[derive(Debug, Clone)]
pub struct SecretsUpdate {
    pub old: Secrets,
    pub new: Secrets,
}

/// The single mutation point for [`Secrets`], the same shape as
/// `SettingsService`: read → mutate → write → store, all under one lock, so a
/// redeem that lands while the settings screen is saving a key cannot lose
/// either of them.
///
/// It is a sibling of `SettingsService` rather than a field of it because the
/// two files are independent: nothing ever needs both locks, and keeping them
/// apart is what makes "the secrets lock is a leaf" true by construction.
pub struct SecretsStore {
    path: PathBuf,
    current: Mutex<Secrets>,
}

impl SecretsStore {
    pub fn new(path: PathBuf, secrets: Secrets) -> Self {
        Self { path, current: Mutex::new(secrets) }
    }

    pub fn get(&self) -> Secrets {
        self.current.lock_safe().clone()
    }

    pub fn status(&self) -> SecretsStatus {
        self.current.lock_safe().status()
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn update<F>(&self, mutate: F) -> Result<SecretsUpdate, SettingsError>
    where
        F: FnOnce(&mut Secrets),
    {
        let mut guard = self.current.lock_safe();
        let old = guard.clone();
        let mut next = old.clone();
        mutate(&mut next);
        next.schema_version = CURRENT_SCHEMA_VERSION;
        if next == old {
            return Ok(SecretsUpdate { old, new: next });
        }
        next.save(&self.path)
            .map_err(|e| SettingsError::Write(e.to_string()))?;
        *guard = next.clone();
        Ok(SecretsUpdate { old, new: next })
    }
}

#[cfg(test)]
mod tests;
