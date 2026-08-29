use super::*;

fn binding(action: &str, combo: &str) -> HotkeyBinding {
    HotkeyBinding { action: action.to_string(), combo: combo.to_string() }
}

fn digit_family_action(id: &'static str) -> HotkeyAction {
    HotkeyAction {
        id,
        group_key: GROUP_CHAT,
        label_key: id,
        hint_key: id,
        kind: HotkeyKind::ModifierDigits,
        scope: HotkeyScope::Hud,
        default_combo: PlatformCombo::shared(MODIFIER_CMD),
    }
}

type ComboOfPlatform = fn(&PlatformCombo) -> &'static str;

const PLATFORM_VIEWS: [(&str, ComboOfPlatform, &[&str]); 2] = [
    ("macos", |c| c.macos, MODIFIER_COMBOS.macos),
    ("windows", |c| c.windows, MODIFIER_COMBOS.windows),
];

#[test]
fn registry_ids_unique_and_defaults_parseable() {
    let mut ids: Vec<&str> = HOTKEY_ACTIONS.iter().map(|a| a.id).collect();
    let count = ids.len();
    ids.sort_unstable();
    ids.dedup();
    assert_eq!(ids.len(), count, "id действий должны быть уникальны");

    for (platform, combo_of, offered) in PLATFORM_VIEWS {
        for a in HOTKEY_ACTIONS {
            let combo = combo_of(&a.default_combo);
            match a.kind {
                HotkeyKind::Combo => assert!(
                    crate::hotkey::parse_hotkey(combo).is_some(),
                    "дефолт {} ({platform}) не разбирается: {combo}",
                    a.id
                ),
                _ => assert!(
                    offered.contains(&combo),
                    "модификатор {} ({platform}) не из реестра: {combo}",
                    a.id
                ),
            }
        }
    }
}

#[test]
fn registry_defaults_do_not_conflict() {
    for (platform, combo_of, _) in PLATFORM_VIEWS {
        for a in HOTKEY_ACTIONS {
            for b in HOTKEY_ACTIONS {
                assert!(
                    !conflict(
                        a.id,
                        combo_of(&a.default_combo),
                        b.id,
                        combo_of(&b.default_combo)
                    ),
                    "дефолты конфликтуют ({platform}): {} и {}",
                    a.id,
                    b.id
                );
            }
        }
    }
}

#[test]
fn windows_defaults_avoid_the_super_key() {
    for a in HOTKEY_ACTIONS {
        assert!(
            !a.default_combo.windows.contains(MODIFIER_CMD),
            "дефолт {} на Windows не должен использовать клавишу Win: {}",
            a.id,
            a.default_combo.windows
        );
    }
    for combo in MODIFIER_COMBOS.windows {
        assert!(
            !combo.contains(MODIFIER_CMD),
            "модификатор {combo} на Windows не предлагается"
        );
    }
}

#[test]
fn effective_falls_back_to_default_and_prefers_last_binding() {
    let record_default = action(ACTION_RECORD).expect("record есть в реестре").default_combo;
    assert_eq!(effective(&[], ACTION_RECORD), record_default.current());
    assert_eq!(effective(&[binding(ACTION_RECORD, "Cmd+Shift+X")], ACTION_RECORD), "Cmd+Shift+X");
    let twice = vec![binding(ACTION_RECORD, "F8"), binding(ACTION_RECORD, "F7")];
    assert_eq!(effective(&twice, ACTION_RECORD), "F7");
}

#[test]
fn combo_conflict_ignores_modifier_order_and_case() {
    assert!(conflict(ACTION_RECORD, "Cmd+Shift+X", ACTION_SEND, "Shift+Cmd+X"));
    assert!(conflict(ACTION_RECORD, "cmd+x", ACTION_SEND, "Cmd+X"));
    assert!(conflict(ACTION_RECORD, "Cmd+KeyX", ACTION_SEND, "Cmd+X"));
    assert!(!conflict(ACTION_RECORD, "Cmd+X", ACTION_SEND, "Cmd+Y"));
}

#[test]
fn arrow_and_plus_minus_families_share_modifier_without_conflict() {
    assert!(!conflict(ACTION_RESIZE_WINDOW, "Cmd+Shift", ACTION_OPACITY, "Cmd+Shift"));
    assert!(conflict(ACTION_RESIZE_WINDOW, "Cmd+Shift", ACTION_SCROLL_CHAT, "Cmd+Shift"));
}

#[test]
fn combo_conflicts_with_family_it_falls_into() {
    assert!(conflict(ACTION_SEND, "Cmd+ArrowUp", ACTION_MOVE_WINDOW, "Cmd"));
    assert!(conflict(ACTION_SEND, "Cmd+Shift+Minus", ACTION_OPACITY, "Cmd+Shift"));
    assert!(!conflict(ACTION_SEND, "Cmd+Enter", ACTION_MOVE_WINDOW, "Cmd"));
}

#[test]
fn digit_family_conflicts_only_with_digit_combos() {
    assert!(conflict(ACTION_SEND, "Cmd+1", ACTION_QUICK_ACTION, "Cmd"));
    assert!(conflict(ACTION_SEND, "Cmd+Digit9", ACTION_QUICK_ACTION, "Cmd"));
    assert!(!conflict(ACTION_SEND, "Cmd+0", ACTION_QUICK_ACTION, "Cmd"));
    assert!(!conflict(ACTION_SEND, "Cmd+Enter", ACTION_QUICK_ACTION, "Cmd"));
    assert!(!conflict(ACTION_SEND, "Alt+1", ACTION_QUICK_ACTION, "Cmd"));
}

#[test]
fn digit_family_shares_a_modifier_with_the_arrow_and_plus_minus_families() {
    assert!(!conflict(ACTION_MOVE_WINDOW, "Cmd", ACTION_QUICK_ACTION, "Cmd"));
    assert!(!conflict(ACTION_OPACITY, "Cmd", ACTION_QUICK_ACTION, "Cmd"));
}

#[test]
fn two_digit_families_collide_on_a_shared_modifier() {
    let first = digit_family_action("первое");
    let second = digit_family_action("второе");
    let cmd = ComboParts::new("Cmd");
    let alt = ComboParts::new("Alt");
    assert!(key_spaces_overlap(&first, &cmd, &second, &cmd));
    assert!(!key_spaces_overlap(&first, &cmd, &second, &alt));
}

#[test]
fn transient_scopes_of_recording_and_teleprompter_may_share_a_combo() {
    assert!(!conflict(ACTION_CANCEL_RECORDING, "Escape", ACTION_TELEPROMPTER_CLOSE, "Escape"));
    assert!(conflict(ACTION_CANCEL_RECORDING, "Escape", ACTION_TOGGLE_WINDOW, "Escape"));
    assert!(conflict(ACTION_TELEPROMPTER_CLOSE, "Space", ACTION_SEND, "Space"));
}

#[test]
fn empty_combo_means_unassigned_and_never_conflicts() {
    assert!(!conflict(ACTION_RECORD, "", ACTION_SEND, ""));
    assert!(!conflict(ACTION_RECORD, "", ACTION_SEND, "Cmd+Enter"));
}

#[test]
fn normalize_drops_unknown_actions_and_duplicate_entries() {
    let mut bindings = vec![
        binding("нет такого", "Cmd+Q"),
        binding(ACTION_RECORD, "F8"),
        binding(ACTION_RECORD, "F7"),
    ];
    normalize(&mut bindings);
    assert_eq!(bindings, vec![binding(ACTION_RECORD, "F7")]);
}

#[test]
fn normalize_gives_a_combo_to_the_latest_claimant() {
    let mut bindings =
        vec![binding(ACTION_TOGGLE_WINDOW, "Cmd+Shift+X"), binding(ACTION_RECORD, "Cmd+Shift+X")];
    normalize(&mut bindings);
    assert_eq!(effective(&bindings, ACTION_RECORD), "Cmd+Shift+X");
    assert_eq!(effective(&bindings, ACTION_TOGGLE_WINDOW), "", "прежний владелец остаётся без хоткея");
}

#[test]
fn normalize_takes_a_combo_away_from_an_untouched_default() {
    let teleprompter_default = effective(&[], ACTION_TELEPROMPTER);
    let mut bindings = vec![binding(ACTION_SEND, &teleprompter_default)];
    normalize(&mut bindings);
    assert_eq!(effective(&bindings, ACTION_SEND), teleprompter_default);
    assert_eq!(
        effective(&bindings, ACTION_TELEPROMPTER),
        "",
        "дефолтный владелец сочетания теряет его"
    );
}

/// The pairwise loop compares combos that were split ONCE up front, so the
/// canonicalisation `conflict` performs has to survive that move: `Cmd+KeyX`
/// and `cmd+x` are still the same key, and the later claimant still wins it.
#[test]
fn normalize_resolves_a_conflict_written_in_another_spelling() {
    let mut bindings =
        vec![binding(ACTION_TOGGLE_WINDOW, "Cmd+KeyX"), binding(ACTION_RECORD, "cmd+x")];
    normalize(&mut bindings);
    assert_eq!(effective(&bindings, ACTION_RECORD), "cmd+x");
    assert_eq!(effective(&bindings, ACTION_TOGGLE_WINDOW), "", "прежний владелец теряет сочетание");
}

/// And the scope rule survives it too: recording and teleprompter never coexist
/// on screen, so both may hold the same combo — through `normalize`, not only
/// through `conflict`.
#[test]
fn normalize_lets_the_two_transient_scopes_share_one_combo() {
    let mut bindings = vec![
        binding(ACTION_CANCEL_RECORDING, "Cmd+Shift+K"),
        binding(ACTION_TELEPROMPTER_CLOSE, "Cmd+Shift+K"),
    ];
    normalize(&mut bindings);
    assert_eq!(effective(&bindings, ACTION_CANCEL_RECORDING), "Cmd+Shift+K");
    assert_eq!(effective(&bindings, ACTION_TELEPROMPTER_CLOSE), "Cmd+Shift+K");
}

#[test]
fn normalize_leaves_untouched_defaults_out_of_the_list() {
    let mut bindings = vec![binding(ACTION_RECORD, &effective(&[], ACTION_RECORD))];
    normalize(&mut bindings);
    assert!(bindings.is_empty(), "совпадающее с дефолтом не хранится");
}

/// `Settings::clamp_after` skips this sweep whenever a write leaves the hotkey
/// map alone, and the whole argument for that is right here: normalizing an
/// already-normalized map cannot change it. The output's ORDER is not the same
/// as the input's (the result is rebuilt in `HOTKEY_ACTIONS` order, and
/// `claimed` reads it back-to-front), so this is not self-evident — it holds
/// because a first pass leaves no colliding pair for a second one to resolve.
#[test]
fn normalize_is_a_fixed_point_of_itself() {
    let cases: Vec<Vec<HotkeyBinding>> = vec![
        vec![],
        vec![binding("нет такого", "Cmd+Q"), binding(ACTION_RECORD, "F8"), binding(ACTION_RECORD, "F7")],
        vec![binding(ACTION_TOGGLE_WINDOW, "Cmd+Shift+X"), binding(ACTION_RECORD, "Cmd+Shift+X")],
        // A user combo that takes an untouched default away from its owner.
        vec![binding(ACTION_SEND, &effective(&[], ACTION_TELEPROMPTER))],
        // Two modifier families on one modifier, i.e. a collision resolved
        // without either side naming a key.
        vec![binding(ACTION_MOVE_WINDOW, MODIFIER_ALT), binding(ACTION_SCROLL_CHAT, MODIFIER_ALT)],
        // Entries `normalize` deletes rather than rewrites: a redundant repeat
        // of the default, and a combo the previous line already took.
        vec![binding(ACTION_RECORD, &effective(&[], ACTION_RECORD))],
    ];
    for case in cases {
        let mut once = case.clone();
        normalize(&mut once);
        let mut twice = once.clone();
        normalize(&mut twice);
        assert_eq!(once, twice, "повторная нормализация обязана ничего не менять: {case:?}");
    }
}

#[test]
fn migration_moves_legacy_fields_and_skips_untouched_defaults() {
    let mut raw = serde_json::json!({
        "hotkey": "Cmd+Shift+X",
        "toggle_hotkey": effective(&[], ACTION_TOGGLE_WINDOW),
        "screenshot_hotkey": "Cmd+Shift+B",
        "scroll_modifier": effective(&[], ACTION_SCROLL_CHAT),
        "theme": "black",
    });
    migrate_legacy_fields(&mut raw);
    let object = raw.as_object().unwrap();
    assert!(!object.contains_key("hotkey"), "старые поля убираются из json");
    assert_eq!(object.get("theme").and_then(|v| v.as_str()), Some("black"));

    let bindings: Vec<HotkeyBinding> =
        serde_json::from_value(object.get("hotkeys").cloned().unwrap()).unwrap();
    assert_eq!(
        bindings,
        vec![binding(ACTION_RECORD, "Cmd+Shift+X"), binding(ACTION_SCREENSHOT, "Cmd+Shift+B")]
    );
}

#[test]
fn migration_keeps_existing_bindings_untouched() {
    let mut raw = serde_json::json!({
        "hotkey": "F5",
        "hotkeys": [{ "action": ACTION_RECORD, "combo": "F6" }],
    });
    migrate_legacy_fields(&mut raw);
    let bindings: Vec<HotkeyBinding> =
        serde_json::from_value(raw.get("hotkeys").cloned().unwrap()).unwrap();
    assert_eq!(bindings, vec![binding(ACTION_RECORD, "F6")]);
}

#[test]
fn auto_mode_action_is_a_global_combo_with_defaults_on_both_platforms() {
    let auto = action(ACTION_AUTO_MODE).expect("автослушание есть в реестре");
    assert_eq!(auto.scope, HotkeyScope::Global);
    assert_eq!(auto.kind, HotkeyKind::Combo);
    for (_, pick, _) in PLATFORM_VIEWS {
        assert!(!pick(&auto.default_combo).is_empty());
    }
}
