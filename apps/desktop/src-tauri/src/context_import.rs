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
mod tests {
    use super::*;

    fn build_pdf(content_stream: &str) -> Vec<u8> {
        let objects: [String; 5] = [
            "<< /Type /Catalog /Pages 2 0 R >>".to_string(),
            "<< /Type /Pages /Kids [3 0 R] /Count 1 >>".to_string(),
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] \
             /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>"
                .to_string(),
            "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>".to_string(),
            format!(
                "<< /Length {} >>\nstream\n{}\nendstream",
                content_stream.len(),
                content_stream
            ),
        ];
        let mut pdf = String::from("%PDF-1.4\n");
        let mut offsets = Vec::with_capacity(objects.len());
        for (i, body) in objects.iter().enumerate() {
            offsets.push(pdf.len());
            pdf.push_str(&format!("{} 0 obj\n{}\nendobj\n", i + 1, body));
        }
        let xref_offset = pdf.len();
        pdf.push_str(&format!("xref\n0 {}\n", objects.len() + 1));
        pdf.push_str("0000000000 65535 f \n");
        for off in &offsets {
            pdf.push_str(&format!("{off:010} 00000 n \n"));
        }
        pdf.push_str(&format!(
            "trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{}\n%%EOF",
            objects.len() + 1,
            xref_offset
        ));
        pdf.into_bytes()
    }

    fn text_pdf() -> Vec<u8> {
        build_pdf("BT /F1 24 Tf 72 700 Td (Hello PDF) Tj ET")
    }

    #[test]
    fn classifies_supported_extensions() {
        assert!(is_supported_extension(Path::new("/a/b/файл.md")));
        assert!(is_supported_extension(Path::new("note.MARKDOWN")));
        assert!(is_supported_extension(Path::new("note.Txt")));
        assert!(is_supported_extension(Path::new("doc.PDF")));
        assert!(!is_supported_extension(Path::new("archive.zip")));
        assert!(!is_supported_extension(Path::new("noext")));
    }

    #[test]
    fn read_rejects_unsupported_extension() {
        let err = read_import_file(Path::new("/tmp/x.docx")).unwrap_err();
        assert_eq!(err, ERR_UNSUPPORTED_EXTENSION);
    }

    #[test]
    fn read_rejects_oversized_text_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("big.md");
        std::fs::write(&path, vec![b'x'; (TEXT_MAX_BYTES + 1) as usize]).unwrap();
        assert_eq!(
            read_import_file(&path).unwrap_err(),
            too_large_message(TEXT_MAX_BYTES)
        );
    }

    #[test]
    fn read_returns_text_content() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("ok.md");
        std::fs::write(&path, "# Заголовок\nтекст").unwrap();
        assert_eq!(read_import_file(&path).unwrap(), "# Заголовок\nтекст");
    }

    #[test]
    fn read_extracts_pdf_from_disk() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("doc.pdf");
        std::fs::write(&path, text_pdf()).unwrap();
        let text = read_import_file(&path).unwrap();
        assert!(text.contains("Hello"), "got: {text:?}");
        assert!(text.contains("PDF"), "got: {text:?}");
    }

    #[test]
    fn extract_reports_scan_when_no_text_layer() {
        assert_eq!(
            extract_pdf_text(&build_pdf("")).unwrap_err(),
            ERR_PDF_NO_TEXT
        );
    }

    #[test]
    fn extract_reports_parse_error_on_garbage() {
        assert_eq!(
            extract_pdf_text(b"this is not a pdf").unwrap_err(),
            ERR_PDF_PARSE
        );
    }

    #[test]
    fn read_pdf_base64_round_trips() {
        let encoded = STANDARD.encode(text_pdf());
        let text = read_pdf_base64(&encoded).unwrap();
        assert!(text.contains("Hello"), "got: {text:?}");
    }

    #[test]
    fn read_pdf_base64_rejects_bad_input() {
        assert_eq!(
            read_pdf_base64("!!! not base64").unwrap_err(),
            ERR_PDF_PARSE
        );
    }

    #[test]
    fn read_pdf_base64_rejects_oversized() {
        let encoded = STANDARD.encode(vec![0u8; (PDF_MAX_BYTES + 1) as usize]);
        assert_eq!(
            read_pdf_base64(&encoded).unwrap_err(),
            too_large_message(PDF_MAX_BYTES)
        );
    }

    #[test]
    fn normalize_collapses_blank_runs_and_trims() {
        let raw = "line one  \r\n\n\n\nline two\r\n\u{c}line three\n\n";
        assert_eq!(
            normalize_extracted_text(raw),
            "line one\n\nline two\n\nline three"
        );
    }

    #[test]
    fn normalize_yields_empty_for_whitespace_only() {
        assert_eq!(normalize_extracted_text("  \n\n\t\r\n \u{c}"), "");
    }
}
