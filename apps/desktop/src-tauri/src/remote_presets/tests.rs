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
