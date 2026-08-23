use super::*;

const PNG_BYTES: &[u8] = b"\x89PNG\r\n\x1a\nfake";
const OTHER_BYTES: &[u8] = b"\x89PNG\r\n\x1a\nother";
const PARALLEL_WRITERS: usize = 8;

fn temp_dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("harpy-chat-images-{name}"));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("создание временной папки");
    dir
}

#[test]
fn save_then_load_returns_the_same_bytes() {
    use base64::Engine;
    let dir = temp_dir("roundtrip");
    let id = save(&dir, "image/png", PNG_BYTES).expect("запись картинки");

    let loaded = load(&dir, std::slice::from_ref(&id));

    assert_eq!(loaded.len(), 1);
    assert_eq!(loaded[0].id, id);
    assert_eq!(
        base64::engine::general_purpose::STANDARD.decode(&loaded[0].data_base64).unwrap(),
        PNG_BYTES
    );
}

#[test]
fn same_content_reuses_one_file() {
    let dir = temp_dir("dedupe");
    let first = save(&dir, "image/png", PNG_BYTES).expect("первая запись");
    let second = save(&dir, "image/png", PNG_BYTES).expect("вторая запись");

    assert_eq!(first, second, "одинаковые байты дают один id");
    let files = std::fs::read_dir(&dir).unwrap().count();
    assert_eq!(files, 1, "второй файл не заводится");
}

#[test]
fn id_carries_the_extension_of_its_media_type() {
    let dir = temp_dir("extension");
    let png = save(&dir, "image/png", PNG_BYTES).expect("png");
    let jpeg = save(&dir, "image/jpeg", OTHER_BYTES).expect("jpeg");

    assert!(png.ends_with(".png"), "{png}");
    assert!(jpeg.ends_with(".jpg"), "{jpeg}");
}

#[test]
fn unsupported_media_type_is_rejected() {
    let dir = temp_dir("unsupported");
    assert!(save(&dir, "image/svg+xml", PNG_BYTES).is_err());
}

#[test]
fn load_skips_missing_and_malformed_ids() {
    let dir = temp_dir("missing");
    let id = save(&dir, "image/png", PNG_BYTES).expect("запись картинки");
    let ids = vec![
        id.clone(),
        "0000000000000000.png".to_string(),
        "../../settings.json".to_string(),
        "не-id".to_string(),
    ];

    let loaded = load(&dir, &ids);

    assert_eq!(loaded.len(), 1, "уцелевшая картинка отдаётся, остальное пропускается");
    assert_eq!(loaded[0].id, id);
}

#[test]
fn traversal_id_never_leaves_the_store() {
    assert!(!is_valid_id("../settings.json"));
    assert!(!is_valid_id("0000000000000000.json"));
    assert!(!is_valid_id("00000000000000.png"), "короткий хеш");
    assert!(!is_valid_id("00000000000000AA.png"), "верхний регистр");
    assert!(is_valid_id("00000000000000aa.png"));
}

#[test]
fn prune_removes_only_unreferenced_images() {
    let dir = temp_dir("prune");
    let kept = save(&dir, "image/png", PNG_BYTES).expect("первая картинка");
    let dropped = save(&dir, "image/png", OTHER_BYTES).expect("вторая картинка");
    let foreign = dir.join("chats.json");
    std::fs::write(&foreign, "[]").expect("чужой файл");

    prune(&dir, std::slice::from_ref(&kept));

    assert!(dir.join(&kept).exists(), "нужная картинка на месте");
    assert!(!dir.join(&dropped).exists(), "ненужная удалена");
    assert!(foreign.exists(), "чужие файлы не трогаются");
}

#[test]
fn save_creates_the_store_directory() {
    let dir = temp_dir("fresh").join(IMAGES_DIR_NAME);

    let id = save(&dir, "image/png", PNG_BYTES).expect("запись в ещё не созданную папку");

    assert!(dir.join(&id).exists(), "папка хранилища заводится по требованию");
}

#[test]
fn load_and_prune_survive_a_missing_directory() {
    let dir = temp_dir("absent").join(IMAGES_DIR_NAME);

    assert!(load(&dir, &["0000000000000000.png".to_string()]).is_empty());
    prune(&dir, &[]);

    assert!(!dir.exists(), "чтение и уборка не заводят папку на пустом месте");
}

#[test]
fn prune_removes_leftover_temporary_files() {
    let dir = temp_dir("leftovers");
    let kept = save(&dir, "image/png", PNG_BYTES).expect("картинка");
    let leftover = dir.join(format!("{kept}.4242-0.{TMP_FILE_EXTENSION}"));
    std::fs::write(&leftover, PNG_BYTES).expect("хвост оборванной записи");

    prune(&dir, std::slice::from_ref(&kept));

    assert!(!leftover.exists(), "недописанный файл убран");
    assert!(dir.join(&kept).exists(), "картинка на месте");
}

#[test]
fn parallel_saves_of_one_image_share_the_id_and_the_file() {
    let dir = temp_dir("parallel");
    let store = &dir;

    let ids: Vec<String> = std::thread::scope(|scope| {
        let writers: Vec<_> = (0..PARALLEL_WRITERS)
            .map(|_| scope.spawn(move || save(store, "image/png", PNG_BYTES)))
            .collect();
        writers
            .into_iter()
            .map(|w| w.join().expect("поток записи").expect("параллельная запись картинки"))
            .collect()
    });

    assert_eq!(ids.len(), PARALLEL_WRITERS, "все писатели дошли до конца");
    assert!(ids.windows(2).all(|pair| pair[0] == pair[1]), "{ids:?}");
    assert_eq!(std::fs::read_dir(&dir).unwrap().count(), 1, "лишних файлов не осталось");
}

#[test]
fn oversized_image_is_rejected_without_touching_the_store() {
    let dir = temp_dir("oversized");
    let bytes = vec![0u8; IMAGE_MAX_BYTES as usize + 1];

    assert!(save(&dir, "image/png", &bytes).is_err());

    assert_eq!(std::fs::read_dir(&dir).unwrap().count(), 0, "ничего не записано");
}
