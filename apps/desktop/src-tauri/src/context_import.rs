use base64::{engine::general_purpose::STANDARD, Engine as _};
use std::panic::AssertUnwindSafe;
use std::path::Path;

const MEGABYTE: u64 = 1_048_576;
pub const TEXT_MAX_BYTES: u64 = MEGABYTE;
pub const PDF_MAX_BYTES: u64 = 20 * MEGABYTE;

const TEXT_EXTENSIONS: [&str; 3] = ["md", "markdown", "txt"];
const PDF_EXTENSION: &str = "pdf";

pub const ERR_UNSUPPORTED_EXTENSION: &str = "Поддерживаются только файлы .md, .txt и .pdf";
pub const ERR_PDF_NO_TEXT: &str =
    "В PDF нет текстового слоя — похоже, это скан. Распознавание изображений пока не поддерживается.";
pub const ERR_PDF_PARSE: &str = "Не удалось разобрать PDF";

enum ImportKind {
    Text,
    Pdf,
}

fn classify(path: &Path) -> Option<ImportKind> {
    let ext = path.extension()?.to_str()?.to_lowercase();
    if TEXT_EXTENSIONS.contains(&ext.as_str()) {
        Some(ImportKind::Text)
    } else if ext == PDF_EXTENSION {
        Some(ImportKind::Pdf)
    } else {
        None
    }
}

pub fn is_supported_extension(path: &Path) -> bool {
    classify(path).is_some()
}

fn too_large_message(max_bytes: u64) -> String {
    format!("Файл больше {} МБ", max_bytes / MEGABYTE)
}

pub fn read_import_file(path: &Path) -> Result<String, String> {
    match classify(path) {
        None => Err(ERR_UNSUPPORTED_EXTENSION.into()),
        Some(ImportKind::Text) => {
            let meta = std::fs::metadata(path).map_err(|e| e.to_string())?;
            if meta.len() > TEXT_MAX_BYTES {
                return Err(too_large_message(TEXT_MAX_BYTES));
            }
            std::fs::read_to_string(path).map_err(|e| e.to_string())
        }
        Some(ImportKind::Pdf) => {
            let meta = std::fs::metadata(path).map_err(|e| e.to_string())?;
            if meta.len() > PDF_MAX_BYTES {
                return Err(too_large_message(PDF_MAX_BYTES));
            }
            let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
            extract_pdf_text(&bytes)
        }
    }
}

pub fn read_pdf_base64(data_base64: &str) -> Result<String, String> {
    let bytes = STANDARD
        .decode(data_base64.trim())
        .map_err(|_| ERR_PDF_PARSE.to_string())?;
    if bytes.len() as u64 > PDF_MAX_BYTES {
        return Err(too_large_message(PDF_MAX_BYTES));
    }
    extract_pdf_text(&bytes)
}

fn extract_pdf_text(bytes: &[u8]) -> Result<String, String> {
    let raw = std::panic::catch_unwind(AssertUnwindSafe(|| {
        pdf_extract::extract_text_from_mem(bytes)
    }))
    .map_err(|_| ERR_PDF_PARSE.to_string())?
    .map_err(|_| ERR_PDF_PARSE.to_string())?;
    finalize_extracted(&raw)
}

fn finalize_extracted(raw: &str) -> Result<String, String> {
    let text = normalize_extracted_text(raw);
    if text.is_empty() {
        return Err(ERR_PDF_NO_TEXT.into());
    }
    Ok(text)
}

fn normalize_extracted_text(raw: &str) -> String {
    let unified = raw.replace('\r', "").replace('\u{c}', "\n");
    let mut out = String::with_capacity(unified.len());
    let mut blank_run = 0usize;
    for line in unified.split('\n') {
        let trimmed = line.trim_end();
        if trimmed.trim().is_empty() {
            blank_run += 1;
            if blank_run == 1 {
                out.push('\n');
            }
            continue;
        }
        blank_run = 0;
        out.push_str(trimmed);
        out.push('\n');
    }
    out.trim().to_string()
}

#[cfg(test)]
mod tests;
