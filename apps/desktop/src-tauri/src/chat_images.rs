use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};

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

const ID_HASH_HEX_LEN: usize = 16;
const ID_EXTENSION_SEPARATOR: char = '.';

const UNSUPPORTED_MEDIA_TYPE: &str = "неподдерживаемый тип картинки";

pub const IMAGE_MAX_BYTES: u64 = 20 * MEGABYTE;

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

fn content_id(bytes: &[u8], extension: &str) -> String {
    let mut hasher = DefaultHasher::new();
    bytes.hash(&mut hasher);
    format!("{:0width$x}{ID_EXTENSION_SEPARATOR}{extension}", hasher.finish(), width = ID_HASH_HEX_LEN)
}

pub fn is_valid_id(id: &str) -> bool {
    let Some((hash, extension)) = id.split_once(ID_EXTENSION_SEPARATOR) else {
        return false;
    };
    hash.len() == ID_HASH_HEX_LEN
        && hash.bytes().all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
        && KNOWN_EXTENSIONS.contains(&extension)
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
        if unreferenced || is_leftover_write(name) {
            let _ = std::fs::remove_file(entry.path());
        }
    }
}

#[cfg(test)]
mod tests;
