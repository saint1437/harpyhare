use super::*;

#[test]
fn notify_unless_version_skipped() {
    assert!(should_notify("0.2.0", ""));
    assert!(should_notify("0.2.0", "0.1.5"));
    assert!(!should_notify("0.2.0", "0.2.0"));
}

#[test]
fn progress_steps_on_whole_percent() {
    let total = Some(1000u64);
    assert_eq!(progress_step(4, total, 0), None);
    assert_eq!(progress_step(10, total, 0), Some(1));
    assert_eq!(progress_step(19, total, 1), None);
    assert_eq!(progress_step(1000, total, 99), Some(100));
}

#[test]
fn progress_steps_per_mib_without_total() {
    const MIB: u64 = BYTES_PER_MIB;
    assert_eq!(progress_step(MIB - 1, None, 0), None);
    assert_eq!(progress_step(MIB, None, 0), Some(1));
    assert_eq!(progress_step(MIB + 5, None, 1), None);
    assert_eq!(progress_step(3 * MIB, None, 1), Some(3));
    assert_eq!(progress_step(2 * MIB, Some(0), 1), Some(2));
}

fn release_contract() -> serde_json::Value {
    serde_json::from_str(RELEASE_CONTRACT_JSON).expect("release-assets.json is not valid JSON")
}

fn updater_endpoint() -> String {
    let conf: serde_json::Value =
        serde_json::from_str(TAURI_CONF_JSON).expect("tauri.conf.json is not valid JSON");
    conf["plugins"]["updater"]["endpoints"][0]
        .as_str()
        .expect("no updater endpoint in tauri.conf.json")
        .to_string()
}

#[test]
fn updater_endpoint_points_at_the_repo_and_manifest_from_the_contract() {
    let contract = release_contract();
    let repo = contract["releasesRepo"].as_str().expect("releasesRepo");
    let manifest = contract["updaterManifestName"]
        .as_str()
        .expect("updaterManifestName");
    let endpoint = updater_endpoint();

    assert!(
        endpoint.contains(repo),
        "endpoint {endpoint} does not point at {repo}"
    );
    assert!(
        endpoint.ends_with(manifest),
        "endpoint {endpoint} does not end with {manifest}"
    );
}

#[test]
fn every_platform_of_the_contract_declares_its_updater_target() {
    let contract = release_contract();
    let platforms = contract["platforms"].as_object().expect("platforms");
    assert_eq!(platforms.len(), 2, "релиз двухплатформенный");

    let mut targets: Vec<&str> = Vec::new();
    for (name, platform) in platforms {
        let target = platform["updaterTarget"]
            .as_str()
            .expect("updaterTarget is a string");
        // Ключ latest.json — `{os}-{arch}`, и os-половина обязана отвечать
        // платформе: перепутанная пара = TargetsNotFound у ВСЕХ, а не у половины.
        let expected_os = if name == "macos" { "darwin" } else { name };
        assert!(
            target.starts_with(&format!("{expected_os}-")),
            "{name}: updaterTarget {target} does not start with {expected_os}-"
        );
        assert!(!platform["installerSuffix"].as_str().unwrap_or("").is_empty());
        assert!(
            !platform["updaterArtifactSuffix"]
                .as_str()
                .unwrap_or("")
                .is_empty()
        );
        targets.push(target);
    }
    targets.sort_unstable();
    targets.dedup();
    assert_eq!(targets.len(), platforms.len(), "updater targets must be unique");
}
