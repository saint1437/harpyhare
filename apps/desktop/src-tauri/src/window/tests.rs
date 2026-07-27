use super::*;
use crate::hotkeys::HotkeyScope;

#[test]
fn global_scope_actions_and_the_registration_table_agree() {
    let registered: Vec<&str> = GLOBAL_HOTKEYS.iter().map(|(id, _, _)| *id).collect();

    for action in hotkeys::HOTKEY_ACTIONS {
        if action.scope != HotkeyScope::Global {
            continue;
        }
        assert!(
            registered.contains(&action.id),
            "глобальное действие {} не зарегистрировано в GLOBAL_HOTKEYS",
            action.id
        );
    }

    for id in registered {
        let action = hotkeys::action(id)
            .unwrap_or_else(|| panic!("{id} из GLOBAL_HOTKEYS отсутствует в реестре действий"));
        assert_eq!(
            action.scope,
            HotkeyScope::Global,
            "{id} регистрируется системным шорткатом, но в реестре не global"
        );
    }
}
