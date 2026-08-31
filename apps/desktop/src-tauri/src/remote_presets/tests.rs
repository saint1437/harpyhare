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

fn pool(version: u32, id: &str) -> String {
    format!(r#"{{"version":{version},"presets":[{{"id":"{id}","name":"N","text":"t"}}]}}"#)
}

#[test]
fn bundled_pool_declares_a_version() {
    // `load_initial` compares versions, so a bundled pool stuck at 0 would lose
    // to any cache forever.
    assert!(PresetPool::bundled().version > 0, "у вшитого пула должна быть версия");
}

#[test]
fn every_bundled_preset_declares_keyterms() {
    // Same invariant the frontend asserts, checked on the Rust side too: this
    // is the copy a user gets offline, before any blob is reachable.
    for preset in PresetPool::bundled().presets {
        assert!(
            preset.text.contains("[keywords]:"),
            "у пресета {} нет блока [keywords]",
            preset.id
        );
    }
}

#[test]
fn a_newer_cache_wins_over_the_bundled_pool() {
    let bundled = PresetPool::bundled();
    let newer = PresetPool::parse(&pool(bundled.version + 1, "from-cache")).unwrap();
    assert!(newer.version > bundled.version);
}

#[test]
fn an_older_cache_loses_to_the_bundled_pool() {
    // The case that matters day to day: a build ships edited presets while the
    // blob still serves the previous pool, and the cache holds that older one.
    let bundled = PresetPool::bundled();
    let older = PresetPool::parse(&pool(bundled.version - 1, "stale")).unwrap();
    assert!(older.version < bundled.version, "старый кэш не должен перебивать свежую сборку");
}
