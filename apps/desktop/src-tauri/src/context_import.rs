use std::path::Path;

pub const IMPORT_MAX_BYTES: u64 = 1_048_576;
const IMPORTABLE_EXTENSIONS: [&str; 3] = ["md", "markdown", "txt"];

pub const ERR_UNSUPPORTED_EXTENSION: &str = "Поддерживаются только файлы .md и .txt";
pub const ERR_TOO_LARGE: &str = "Файл больше 1 МБ";

pub fn has_importable_extension(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| IMPORTABLE_EXTENSIONS.contains(&e.to_lowercase().as_str()))
        .unwrap_or(false)
}

pub fn read_import_file(path: &Path) -> Result<String, String> {
    if !has_importable_extension(path) {
        return Err(ERR_UNSUPPORTED_EXTENSION.into());
    }
    let meta = std::fs::metadata(path).map_err(|e| e.to_string())?;
    if meta.len() > IMPORT_MAX_BYTES {
        return Err(ERR_TOO_LARGE.into());
    }
    std::fs::read_to_string(path).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extension_gate() {
        assert!(has_importable_extension(Path::new("/a/b/файл.md")));
        assert!(has_importable_extension(Path::new("note.MARKDOWN")));
        assert!(has_importable_extension(Path::new("note.Txt")));
        assert!(!has_importable_extension(Path::new("archive.zip")));
        assert!(!has_importable_extension(Path::new("noext")));
        assert!(!has_importable_extension(Path::new("script.sh")));
    }

    #[test]
    fn read_rejects_unsupported_extension() {
        let err = read_import_file(Path::new("/tmp/x.pdf")).unwrap_err();
        assert_eq!(err, ERR_UNSUPPORTED_EXTENSION);
    }

    #[test]
    fn read_rejects_oversized_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("big.md");
        std::fs::write(&path, vec![b'x'; (IMPORT_MAX_BYTES + 1) as usize]).unwrap();
        assert_eq!(read_import_file(&path).unwrap_err(), ERR_TOO_LARGE);
    }

    #[test]
    fn read_returns_content() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("ok.md");
        std::fs::write(&path, "# Заголовок\nтекст").unwrap();
        assert_eq!(read_import_file(&path).unwrap(), "# Заголовок\nтекст");
    }
}
