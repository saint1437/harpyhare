//! The opaque-JSON document store behind `chats.json` and
//! `context-library.json`.
//!
//! Rust never looks inside these documents — the frontend owns their model —
//! but it does own the file format around them. Two things live here that the
//! former two-line module did not have:
//!
//! * **An honest read.** `read_to_string(path).unwrap_or_default()` turned "no
//!   file", "no permission", "broken UTF-8" and "the disk went away" all into
//!   `""`. The frontend reads that as "no chats", creates one and its 500 ms
//!   autosave debounce writes the empty state over the real file. `load` now
//!   answers `Ok(None)` for a missing file and an error for everything else.
//! * **A version envelope.** `{"version": n, "payload": …}` is written; a bare
//!   document (the pre-envelope format — an array for chats, an object for the
//!   library) is still read, recognised by shape. The envelope is unwrapped
//!   before the string reaches the frontend, so the IPC contract is unchanged.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde_json::value::RawValue;

use crate::error::{AppError, CodedError, ErrorCode};
use crate::settings::write_atomic_owner_only;

/// The envelope version written today. Bump it together with a reader branch in
/// `unwrap_envelope`.
pub const CURRENT_DOCUMENT_VERSION: u32 = 1;

const VERSION_KEY: &str = "version";
const PAYLOAD_KEY: &str = "payload";

/// One rotating copy of the last good document, taken immediately before an
/// overwrite. Deliberately a copy and not a rename: a rename leaves a window
/// with no file at the real path at all.
const BACKUP_SUFFIX: &str = "bak";

const ERR_BLANK_OVER_EXISTING: &str =
    "отказ записать пустой документ поверх непустого файла";

#[derive(Debug, thiserror::Error)]
pub enum StoreError {
    #[error("Не удалось прочитать {0}: {1}")]
    Read(String, String),
    #[error("Не удалось записать {0}: {1}")]
    Write(String, String),
    #[error("Файл {0} повреждён: {1}")]
    Corrupt(String, String),
}

impl CodedError for StoreError {
    fn code(&self) -> ErrorCode {
        ErrorCode::Internal
    }
}

impl From<StoreError> for AppError {
    fn from(e: StoreError) -> Self {
        AppError::new(e.code(), e.to_string())
    }
}

fn name_of(path: &Path) -> String {
    path.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.display().to_string())
}

fn backup_path(path: &Path) -> PathBuf {
    let mut name = path.file_name().unwrap_or_default().to_os_string();
    name.push(format!(".{BACKUP_SUFFIX}"));
    path.with_file_name(name)
}

/// `[]` and `{}` are legitimate — deleting every chat or every material is
/// something a user does on purpose — so only a document with no content at all
/// is refused. Those two are covered by the `.bak` copy instead.
fn is_blank_document(raw: &str) -> bool {
    let trimmed = raw.trim();
    trimmed.is_empty() || trimmed == "null"
}

/// The envelope on its way to disk.
///
/// `payload` is a `RawValue`, so neither half of this module ever builds a
/// `serde_json::Value` DOM for a document that is the user's whole chat history:
/// the frontend's own bytes are spliced in as they arrived.
///
/// `Serialize` is written out rather than derived for two reasons. The key
/// constants above stay the single source of the format — a derive would have
/// had to repeat "version" and "payload" as literals. And the field ORDER
/// reproduces what the former `serde_json::json!` map emitted: serde_json's
/// `Map` is a `BTreeMap` here, so its keys came out alphabetically, and the
/// file this build writes for the frontend's (compact) document is therefore
/// byte-for-byte the file the previous one wrote —
/// `the_envelope_is_written_byte_for_byte_as_before` holds it there.
struct Envelope<'a> {
    payload: &'a RawValue,
    version: u32,
}

impl serde::Serialize for Envelope<'_> {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut envelope = serializer.serialize_struct("Envelope", 2)?;
        envelope.serialize_field(PAYLOAD_KEY, self.payload)?;
        envelope.serialize_field(VERSION_KEY, &self.version)?;
        envelope.end()
    }
}

/// Recognises the envelope by reading only the TOP-LEVEL keys: the values come
/// back as raw slices, so the payload — the whole history — is never parsed on
/// its way back to the frontend.
///
/// The three conditions are exactly the ones the former `Value` version
/// enforced, and each of them earns a test: the document is an object, `version`
/// is a non-negative integer, and `payload` is present. Anything else is a bare
/// pre-envelope document and is handed back untouched.
fn envelope_payload(raw: &str) -> Option<&RawValue> {
    let fields: HashMap<&str, &RawValue> = serde_json::from_str(raw).ok()?;
    serde_json::from_str::<u64>(fields.get(VERSION_KEY)?.get()).ok()?;
    fields.get(PAYLOAD_KEY).copied()
}

/// Reads a stored document. `Ok(None)` means — and only means — that the file
/// does not exist yet.
pub fn load(path: &Path) -> Result<Option<String>, StoreError> {
    let raw = match std::fs::read_to_string(path) {
        Ok(raw) => raw,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(StoreError::Read(name_of(path), e.to_string())),
    };
    if raw.trim().is_empty() {
        return Ok(None);
    }
    // This parse exists for its VALIDATION alone, which is why its result is
    // dropped: a syntax error has to reach the user as `Corrupt` rather than be
    // waved through as "a bare pre-envelope document" by the shape check below.
    // `RawValue` validates the document whole without allocating a node per
    // value the way the former `Value` parse did.
    serde_json::from_str::<&RawValue>(&raw)
        .map_err(|e| StoreError::Corrupt(name_of(path), e.to_string()))?;
    if let Some(payload) = envelope_payload(&raw) {
        // `get()` is the payload's own bytes off the disk. The former
        // `to_string(payload)` re-serialised a DOM to arrive at the same text —
        // this module writes the payload compactly, so it is the same text.
        return Ok(Some(payload.get().to_string()));
    }
    Ok(Some(raw))
}

fn rotate_backup(path: &Path) {
    if !path.exists() {
        return;
    }
    if let Err(e) = std::fs::copy(path, backup_path(path)) {
        eprintln!("не удалось обновить резервную копию {}: {e}", name_of(path));
    }
}

/// Writes the document inside the current envelope, keeping one `.bak` copy of
/// what was there before.
pub fn save(path: &Path, json: &str) -> Result<(), StoreError> {
    if is_blank_document(json) && path.exists() {
        return Err(StoreError::Write(
            name_of(path),
            ERR_BLANK_OVER_EXISTING.into(),
        ));
    }
    // The same validation as before — a document that is not JSON is refused
    // and nothing is written — but without materialising the whole history as a
    // `Value` tree only to serialise it straight back out.
    let payload: &RawValue = serde_json::from_str(json)
        .map_err(|e| StoreError::Corrupt(name_of(path), e.to_string()))?;
    let encoded = serde_json::to_string(&Envelope {
        payload,
        version: CURRENT_DOCUMENT_VERSION,
    })
    .map_err(|e| StoreError::Write(name_of(path), e.to_string()))?;
    rotate_backup(path);
    write_atomic_owner_only(path, &encoded)
        .map_err(|e| StoreError::Write(name_of(path), e.to_string()))
}

#[cfg(test)]
mod tests;
