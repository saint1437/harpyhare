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
    assert!(classify(Path::new("/a/b/файл.md")).is_some());
    assert!(classify(Path::new("note.MARKDOWN")).is_some());
    assert!(classify(Path::new("note.Txt")).is_some());
    assert!(classify(Path::new("doc.PDF")).is_some());
    assert!(classify(Path::new("archive.zip")).is_none());
    assert!(classify(Path::new("noext")).is_none());
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

/// `\r` used to be stripped by a `replace` over the whole document, so it went
/// wherever it appeared and not only before a newline. The single-pass version
/// has to keep doing that — a bare CR inside a line is a real thing in text
/// pulled out of a PDF.
#[test]
fn normalize_drops_a_carriage_return_in_the_middle_of_a_line() {
    assert_eq!(normalize_extracted_text("one\rtwo\r\nthree"), "onetwo\nthree");
}

/// Indentation is content and survives; what is trimmed is each line's TAIL,
/// plus the document's own leading and trailing whitespace at the very end —
/// which is why the first line loses its indent and the third keeps it. A line
/// made only of whitespace is blank and collapses a run.
#[test]
fn normalize_keeps_indentation_and_trims_only_line_ends() {
    assert_eq!(
        normalize_extracted_text("  first   \n\t\n  indented  "),
        "first\n\n  indented"
    );
}
