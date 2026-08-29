use super::*;
use crate::hotkeys::MODIFIER_COMBOS;

#[test]
fn every_offered_combo_parses_to_a_distinct_mask() {
    let mut seen = Vec::new();
    for combo in MODIFIER_COMBOS.current() {
        let mask = modifier_mask(combo);
        assert!(!mask.is_empty(), "комбо {combo:?} не разобрано в флаги");
        assert!(!seen.contains(&mask), "комбо {combo:?} дублирует уже занятые флаги");
        seen.push(mask);
    }
}

#[test]
fn unknown_token_yields_empty_mask() {
    assert!(modifier_mask("Fn").is_empty());
    assert!(modifier_mask("").is_empty());
}

#[test]
fn combo_spec_merges_flags_of_its_parts() {
    assert_eq!(
        modifier_mask("Cmd+Shift"),
        modifier_mask("Cmd") | modifier_mask("Shift")
    );
}

#[test]
fn every_modifier_default_is_offered_by_the_ui() {
    let families = crate::hotkeys::HOTKEY_ACTIONS
        .iter()
        .filter(|a| a.kind != crate::hotkeys::HotkeyKind::Combo);
    for action in families {
        assert!(
            MODIFIER_COMBOS.current().contains(&action.default_combo.current()),
            "дефолт {:?} не предлагается в UI",
            action.default_combo.current()
        );
    }
}

#[test]
fn only_web_urls_are_openable() {
    assert!(is_web_url("https://example.com"));
    assert!(is_web_url("http://example.com"));
    assert!(!is_web_url("file:///etc/passwd"));
    assert!(!is_web_url("smb://server/share"));
}

#[test]
fn named_bits_match_token_order() {
    use crate::hotkeys::{MODIFIER_ALT, MODIFIER_CMD, MODIFIER_CTRL, MODIFIER_SHIFT};
    assert_eq!(modifier_mask(MODIFIER_CMD), ModifierMask::CMD);
    assert_eq!(modifier_mask(MODIFIER_CTRL), ModifierMask::CTRL);
    assert_eq!(modifier_mask(MODIFIER_ALT), ModifierMask::ALT);
    assert_eq!(modifier_mask(MODIFIER_SHIFT), ModifierMask::SHIFT);
}

#[test]
fn mask_prints_its_tokens() {
    assert_eq!(modifier_mask("Ctrl+Shift").to_string(), "Ctrl+Shift");
    assert_eq!(ModifierMask::EMPTY.to_string(), "нет");
}

// ---------- the packed snapshot the keyboard hook reads ----------

/// Not decoration: the whole point of the packing is that the hook never takes
/// the settings lock, so a field silently truncated by the layout would be a
/// wrong window step nobody could see. `move_step` is exercised at its maximum.
#[test]
fn the_snapshot_survives_the_round_trip_through_one_word() {
    let keys = ArrowKeys {
        move_mask: modifier_mask("Cmd") | modifier_mask("Shift"),
        resize_mask: modifier_mask("Ctrl") | modifier_mask("Alt"),
        move_step: crate::settings::limits::window::MOVE_STEP.max,
    };
    assert_eq!(ArrowKeys::unpack(keys.pack()), keys);
}

#[test]
fn the_snapshot_is_derived_from_the_two_window_bindings_and_the_step() {
    use crate::hotkeys::{HotkeyBinding, ACTION_MOVE_WINDOW, ACTION_RESIZE_WINDOW};
    let settings = crate::settings::Settings {
        hotkeys: vec![
            HotkeyBinding { action: ACTION_MOVE_WINDOW.into(), combo: "Alt".into() },
            HotkeyBinding { action: ACTION_RESIZE_WINDOW.into(), combo: "Alt+Shift".into() },
        ],
        move_step: 7,
        ..Default::default()
    };
    let keys = ArrowKeys::of(&settings);
    assert_eq!(keys.move_mask, modifier_mask("Alt"));
    assert_eq!(keys.resize_mask, modifier_mask("Alt+Shift"));
    assert_eq!(keys.move_step, 7);
}

/// An unwritten snapshot must decide nothing — the same answer the contended
/// settings lock used to give the hook.
#[test]
fn an_empty_snapshot_claims_no_arrow_press() {
    let keys = ArrowKeys::unpack(0);
    assert!(keys.move_mask.is_empty());
    assert!(keys.resize_mask.is_empty());
    assert_ne!(modifier_mask("Cmd"), keys.move_mask);
    assert_ne!(modifier_mask("Cmd"), keys.resize_mask);
}
