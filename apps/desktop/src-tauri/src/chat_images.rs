use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use sha2::{Digest, Sha256};

use crate::context_import::{too_large_message, MEGABYTE};
use crate::settings::{write_atomic_owner_only_bytes, TMP_FILE_EXTENSION};

pub const IMAGES_DIR_NAME: &str = "images";

const PNG_MEDIA_TYPE: &str = "image/png";
const JPEG_MEDIA_TYPE: &str = "image/jpeg";
const GIF_MEDIA_TYPE: &str = "image/gif";
const WEBP_MEDIA_TYPE: &str = "image/webp";

const PNG_EXTENSION: &str = "png";
const JPEG_EXTENSION: &str = "jpg";
const GIF_EXTENSION: &str = "gif";
const WEBP_EXTENSION: &str = "webp";

const KNOWN_EXTENSIONS: [&str; 4] =
    [PNG_EXTENSION, JPEG_EXTENSION, GIF_EXTENSION, WEBP_EXTENSION];

/// 128 bits of SHA-256, hex. The length also tells the two id generations
/// apart, which is what makes accepting the old one on read unambiguous.
const ID_HASH_HEX_LEN: usize = 32;

/// The former ids: 64 bits of `DefaultHasher`. `std` documents that hasher's
/// algorithm as unspecified and free to change between Rust releases, so the
/// same bytes hashed by a newer toolchain produced a DIFFERENT file name — the
/// references already sitting in `chats.json` stopped resolving, `load` skipped
/// them with `.ok()?`, images vanished from the history and `prune` then deleted
/// the files as unreferenced. Read support for these stays forever; nothing
/// writes them any more.
const LEGACY_ID_HASH_HEX_LEN: usize = 16;

const ID_EXTENSION_SEPARATOR: char = '.';

/// While installs still carry legacy-named files, `prune` refuses to delete an
/// unreferenced one that is younger than this. A `chats.json` that failed to
/// load hands `prune` a short `keep` list, and without the grace period one such
/// start would take the images with it.
const LEGACY_ID_GRACE: Duration = Duration::from_secs(30 * 24 * 60 * 60);

const UNSUPPORTED_MEDIA_TYPE: &str = "неподдерживаемый тип картинки";

/// Base64 inflates a payload by ~4/3, and the encoded attachment has to fit
/// inside `llm::MAX_REQUEST_BYTES` together with the rest of the conversation:
/// 6 MB becomes ~8 MB encoded and leaves ~4 MB for history and other images.
///
/// The old value was 20 MB, which no request could ever carry — encoded it came
/// to ~26.7 MB, above the proxy's limit in every configuration it has had.
pub const IMAGE_MAX_BYTES: u64 = 6 * MEGABYTE;

#[derive(Clone, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct StoredImage {
    pub id: String,
    pub data_base64: String,
}

fn extension_for(media_type: &str) -> Option<&'static str> {
    match media_type {
        PNG_MEDIA_TYPE => Some(PNG_EXTENSION),
        JPEG_MEDIA_TYPE => Some(JPEG_EXTENSION),
        GIF_MEDIA_TYPE => Some(GIF_EXTENSION),
        WEBP_MEDIA_TYPE => Some(WEBP_EXTENSION),
        _ => None,
    }
}

/// SHA-256, truncated to `ID_HASH_HEX_LEN` hex characters. The algorithm has to
/// be one whose output is fixed by a specification rather than by whichever
/// compiler built the binary — the id is written into `chats.json` and has to
/// keep meaning the same file across toolchain updates.
fn content_id(bytes: &[u8], extension: &str) -> String {
    use std::fmt::Write as _;
    let digest = Sha256::digest(bytes);
    // Written straight into the pre-sized buffer: `format!` per byte allocated
    // sixteen short `String`s for every image, and a second `format!` copied the
    // result again to glue the extension on.
    let mut id = String::with_capacity(ID_HASH_HEX_LEN + 1 + extension.len());
    for byte in digest.iter().take(ID_HASH_HEX_LEN / 2) {
        // Writing into a `String` cannot fail; there is no error to report.
        let _ = write!(id, "{byte:02x}");
    }
    id.push(ID_EXTENSION_SEPARATOR);
    id.push_str(extension);
    id
}

fn split_id(id: &str) -> Option<(&str, &str)> {
    let (hash, extension) = id.split_once(ID_EXTENSION_SEPARATOR)?;
    let hex = hash
        .bytes()
        .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase());
    (hex && !hash.is_empty() && KNOWN_EXTENSIONS.contains(&extension)).then_some((hash, extension))
}

/// Path traversal protection first, format check second: the id comes out of
/// `chats.json`, a file the user can edit by hand, and `../../settings.json`
/// would otherwise be a readable "image".
pub fn is_valid_id(id: &str) -> bool {
    split_id(id).is_some_and(|(hash, _)| {
        hash.len() == ID_HASH_HEX_LEN || hash.len() == LEGACY_ID_HASH_HEX_LEN
    })
}

/// Written by a build from before the hash was pinned.
pub fn is_legacy_id(id: &str) -> bool {
    split_id(id).is_some_and(|(hash, _)| hash.len() == LEGACY_ID_HASH_HEX_LEN)
}

fn younger_than(entry: &std::fs::DirEntry, age: Duration) -> bool {
    entry
        .metadata()
        .and_then(|m| m.modified())
        .ok()
        .and_then(|at| SystemTime::now().duration_since(at).ok())
        .is_none_or(|elapsed| elapsed < age)
}

fn path_of(dir: &Path, id: &str) -> Option<PathBuf> {
    is_valid_id(id).then(|| dir.join(id))
}

pub fn save(dir: &Path, media_type: &str, bytes: &[u8]) -> Result<String, String> {
    let extension = extension_for(media_type).ok_or(UNSUPPORTED_MEDIA_TYPE)?;
    if bytes.len() as u64 > IMAGE_MAX_BYTES {
        return Err(too_large_message(IMAGE_MAX_BYTES));
    }
    let id = content_id(bytes, extension);
    let path = dir.join(&id);
    if path.exists() {
        return Ok(id);
    }
    write_atomic_owner_only_bytes(&path, bytes).map_err(|e| e.to_string())?;
    Ok(id)
}

pub fn load(dir: &Path, ids: &[String]) -> Vec<StoredImage> {
    use base64::Engine;
    ids.iter()
        .filter_map(|id| {
            let bytes = std::fs::read(path_of(dir, id)?).ok()?;
            Some(StoredImage {
                id: id.clone(),
                data_base64: base64::engine::general_purpose::STANDARD.encode(bytes),
            })
        })
        .collect()
}

fn is_leftover_write(name: &str) -> bool {
    name.rsplit_once(ID_EXTENSION_SEPARATOR).is_some_and(|(_, ext)| ext == TMP_FILE_EXTENSION)
}

pub fn prune(dir: &Path, keep: &[String]) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name();
        let Some(name) = name.to_str() else { continue };
        let unreferenced = is_valid_id(name) && !keep.iter().any(|k| k == name);
        let under_grace = is_legacy_id(name) && younger_than(&entry, LEGACY_ID_GRACE);
        if (unreferenced && !under_grace) || is_leftover_write(name) {
            let _ = std::fs::remove_file(entry.path());
        }
    }
}

#[cfg(test)]
mod tests;
