use super::*;
use crate::identity::{is_known_id, list, ORIGINAL_DISPLAY_NAME};

fn dict_with_icon(value: &str) -> plist::Dictionary {
    let mut d = plist::Dictionary::new();
    d.insert(
        CFBUNDLE_ICON_FILE_KEY.to_string(),
        plist::Value::String(value.to_string()),
    );
    d
}

#[test]
fn icon_file_name_appends_icns_when_extension_missing() {
    assert_eq!(icon_file_name(&dict_with_icon("icon")), "icon.icns");
    assert_eq!(icon_file_name(&dict_with_icon("AppIcon")), "AppIcon.icns");
}

#[test]
fn icon_file_name_keeps_existing_icns() {
    assert_eq!(icon_file_name(&dict_with_icon("AppIcon.icns")), "AppIcon.icns");
}

#[test]
fn icon_file_name_defaults_when_key_absent() {
    assert_eq!(
        icon_file_name(&plist::Dictionary::new()),
        DEFAULT_ICON_FILE_NAME
    );
}

#[test]
fn find_empty_id_returns_original() {
    let def = find("").expect("empty id maps to original");
    assert_eq!(def.id, "");
    assert_eq!(def.display_name, ORIGINAL_DISPLAY_NAME);
}

#[test]
fn find_and_is_known_id_cover_known_and_unknown() {
    assert!(find("obsidian").is_some());
    assert!(find("not-a-real-identity").is_none());
    assert!(is_known_id("obsidian"));
    assert!(is_known_id(""));
    assert!(!is_known_id("not-a-real-identity"));
}

#[test]
fn list_starts_with_original_then_all_identities() {
    let listed = list();
    assert_eq!(listed.len(), IDENTITIES.len() + 1);
    assert_eq!(listed[0].id, "");
    assert_eq!(listed[0].display_name, ORIGINAL_DISPLAY_NAME);
    assert!(!listed[0].icon_png_base64.is_empty());
    assert_eq!(listed[1].id, IDENTITIES[0].id);
}

#[test]
fn tmp_sibling_appends_suffix_next_to_target() {
    let p = Path::new("/x/Contents/Info.plist");
    assert_eq!(
        tmp_sibling(p),
        PathBuf::from("/x/Contents/Info.plist.identity-tmp")
    );
}
