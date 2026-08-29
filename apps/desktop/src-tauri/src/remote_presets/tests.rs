use super::*;

#[test]
fn bundled_presets_are_valid() {
    let pool = PresetPool::parse(BUNDLED_PRESETS_JSON).expect("вшитый presets.json валиден");
    assert!(!pool.presets.is_empty());
    assert!(pool.presets.iter().any(|p| p.id == "golang"));
}

#[test]
fn parse_rejects_empty_id() {
    assert!(
        PresetPool::parse(r#"{"version":1,"presets":[{"id":" ","name":"x","text":"y"}]}"#)
            .is_none()
    );
}

#[test]
fn parse_rejects_malformed_json() {
    assert!(PresetPool::parse("не json").is_none());
}

#[test]
fn parse_accepts_valid_pool() {
    let pool =
        PresetPool::parse(r#"{"version":2,"presets":[{"id":"a","name":"A","text":"t"}]}"#)
            .unwrap();
    assert_eq!(pool.version, 2);
    assert_eq!(pool.presets.len(), 1);
}

/// The whole point of the newtype is that nothing on the wire notices it: the
/// pool is shared by reference count inside Rust and still arrives as a plain
/// array, which is what keeps `bindings.ts` and `PromptPreset[]` unchanged.
#[test]
fn the_shared_pool_serializes_as_a_bare_array() {
    let raw = r#"{"version":3,"presets":[{"id":"a","name":"A","text":"t"}]}"#;
    let pool = PresetPool::parse(raw).unwrap();
    assert_eq!(
        serde_json::to_string(&pool.presets).unwrap(),
        r#"[{"id":"a","name":"A","text":"t"}]"#
    );
    assert_eq!(serde_json::to_string(&pool).unwrap(), raw, "и файл кэша не меняет формат");
}

/// A clone has to be a refcount bump rather than a copy of the text — that is
/// the only reason the command and the refresh event may hand it around.
#[test]
fn cloning_the_pool_shares_one_allocation() {
    let pool =
        PresetPool::parse(r#"{"version":1,"presets":[{"id":"a","name":"A","text":"t"}]}"#).unwrap();
    let copy = pool.presets.clone();
    assert!(std::ptr::eq(&*pool.presets, &*copy), "клон обязан делить ту же память");
}
