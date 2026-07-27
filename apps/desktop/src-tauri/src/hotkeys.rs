use serde::{Deserialize, Serialize};

pub const ACTION_RECORD: &str = "record";
pub const ACTION_CANCEL_RECORDING: &str = "cancel_recording";
pub const ACTION_SEND: &str = "send";
pub const ACTION_SCREENSHOT: &str = "screenshot";
pub const ACTION_QUICK_ACTION: &str = "quick_action";
pub const ACTION_FOCUS_PROMPT: &str = "focus_prompt";
pub const ACTION_TOGGLE_WINDOW: &str = "toggle_window";
pub const ACTION_MOVE_WINDOW: &str = "move_window";
pub const ACTION_RESIZE_WINDOW: &str = "resize_window";
pub const ACTION_OPACITY: &str = "opacity";
pub const ACTION_SCROLL_CHAT: &str = "scroll_chat";
pub const ACTION_TELEPROMPTER: &str = "teleprompter";
pub const ACTION_TELEPROMPTER_CLOSE: &str = "teleprompter_close";
pub const ACTION_TELEPROMPTER_PAUSE: &str = "teleprompter_pause";

macro_rules! cmd_token {
    () => {
        "Cmd"
    };
}
macro_rules! ctrl_token {
    () => {
        "Ctrl"
    };
}
macro_rules! alt_token {
    () => {
        "Alt"
    };
}
macro_rules! shift_token {
    () => {
        "Shift"
    };
}
macro_rules! separator_token {
    () => {
        "+"
    };
}

macro_rules! primary_combo {
    ($($rest:expr),*) => {
        PlatformCombo {
            macos: concat!(cmd_token!() $(, separator_token!(), $rest)*),
            windows: concat!(ctrl_token!() $(, separator_token!(), $rest)*),
        }
    };
}

pub const MODIFIER_CMD: &str = cmd_token!();
pub const MODIFIER_CTRL: &str = ctrl_token!();
pub const MODIFIER_ALT: &str = alt_token!();
pub const MODIFIER_SHIFT: &str = shift_token!();

#[derive(Debug, Clone, Copy, PartialEq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct PlatformCombo {
    pub macos: &'static str,
    pub windows: &'static str,
}

impl PlatformCombo {
    const fn shared(combo: &'static str) -> Self {
        Self { macos: combo, windows: combo }
    }

    pub fn current(&self) -> &'static str {
        #[cfg(target_os = "macos")]
        {
            self.macos
        }
        #[cfg(target_os = "windows")]
        {
            self.windows
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct PlatformModifierCombos {
    pub macos: &'static [&'static str],
    pub windows: &'static [&'static str],
}

impl PlatformModifierCombos {
    pub fn current(&self) -> &'static [&'static str] {
        #[cfg(target_os = "macos")]
        {
            self.macos
        }
        #[cfg(target_os = "windows")]
        {
            self.windows
        }
    }
}

pub const MODIFIER_TOKENS: &[&str] =
    &[MODIFIER_CMD, MODIFIER_CTRL, MODIFIER_ALT, MODIFIER_SHIFT];

pub const MODIFIER_COMBOS: PlatformModifierCombos = PlatformModifierCombos {
    macos: &[
        cmd_token!(),
        ctrl_token!(),
        alt_token!(),
        concat!(cmd_token!(), separator_token!(), shift_token!()),
        concat!(ctrl_token!(), separator_token!(), shift_token!()),
        concat!(alt_token!(), separator_token!(), shift_token!()),
    ],
    windows: &[
        ctrl_token!(),
        alt_token!(),
        concat!(ctrl_token!(), separator_token!(), shift_token!()),
        concat!(alt_token!(), separator_token!(), shift_token!()),
    ],
};
const ARROW_KEYS: &[&str] = &["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
const PLUS_MINUS_KEYS: &[&str] = &["Minus", "Equal"];
const FIRST_DIGIT_KEY: usize = 1;
pub const COMBO_SEPARATOR: char = separator_token!().as_bytes()[0] as char;

#[derive(Debug, Clone, Copy, PartialEq, Serialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum HotkeyKind {
    Combo,
    ModifierArrows,
    ModifierPlusMinus,
    ModifierDigits,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum HotkeyScope {
    Global,
    Recording,
    Hud,
    Teleprompter,
}

#[derive(Debug, Clone, Copy, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct HotkeyAction {
    pub id: &'static str,
    pub group: &'static str,
    pub label: &'static str,
    pub hint: &'static str,
    pub kind: HotkeyKind,
    pub scope: HotkeyScope,
    pub default_combo: PlatformCombo,
}

pub const HOTKEY_ACTIONS: &[HotkeyAction] = &[
    HotkeyAction {
        id: ACTION_RECORD,
        group: "Запись",
        label: "Записать системный звук",
        hint: "Удерживайте, пока говорит собеседник.",
        kind: HotkeyKind::Combo,
        scope: HotkeyScope::Global,
        default_combo: PlatformCombo::shared("F9"),
    },
    HotkeyAction {
        id: ACTION_CANCEL_RECORDING,
        group: "Запись",
        label: "Отменить запись",
        hint: "Слушается только пока идёт запись.",
        kind: HotkeyKind::Combo,
        scope: HotkeyScope::Recording,
        default_combo: PlatformCombo::shared("Escape"),
    },
    HotkeyAction {
        id: ACTION_SEND,
        group: "Отправка",
        label: "Отправить",
        hint: "Работает из любого места окна, не только из поля ввода.",
        kind: HotkeyKind::Combo,
        scope: HotkeyScope::Hud,
        default_combo: primary_combo!("Enter"),
    },
    HotkeyAction {
        id: ACTION_SCREENSHOT,
        group: "Отправка",
        label: "Снимок области экрана",
        hint: "Выделенная область уходит вложением в чат.",
        kind: HotkeyKind::Combo,
        scope: HotkeyScope::Global,
        default_combo: primary_combo!(shift_token!(), "S"),
    },
    HotkeyAction {
        id: ACTION_QUICK_ACTION,
        group: "Отправка",
        label: "Быстрое действие",
        hint: "Модификатор с цифрой: 1…9 по порядку кнопок.",
        kind: HotkeyKind::ModifierDigits,
        scope: HotkeyScope::Hud,
        default_combo: primary_combo!(),
    },
    HotkeyAction {
        id: ACTION_FOCUS_PROMPT,
        group: "Отправка",
        label: "Сфокусировать поле ввода",
        hint: "Поднимает окно и ставит каретку в конец текста.",
        kind: HotkeyKind::Combo,
        scope: HotkeyScope::Global,
        default_combo: primary_combo!(shift_token!(), "D"),
    },
    HotkeyAction {
        id: ACTION_TOGGLE_WINDOW,
        group: "Окно",
        label: "Скрыть или показать",
        hint: "Работает, даже когда окно спрятано.",
        kind: HotkeyKind::Combo,
        scope: HotkeyScope::Global,
        default_combo: primary_combo!(shift_token!(), "H"),
    },
    HotkeyAction {
        id: ACTION_MOVE_WINDOW,
        group: "Окно",
        label: "Передвинуть",
        hint: "Модификатор со стрелками.",
        kind: HotkeyKind::ModifierArrows,
        scope: HotkeyScope::Hud,
        default_combo: primary_combo!(),
    },
    HotkeyAction {
        id: ACTION_RESIZE_WINDOW,
        group: "Окно",
        label: "Изменить размер",
        hint: "Модификатор со стрелками.",
        kind: HotkeyKind::ModifierArrows,
        scope: HotkeyScope::Hud,
        default_combo: primary_combo!(shift_token!()),
    },
    HotkeyAction {
        id: ACTION_OPACITY,
        group: "Окно",
        label: "Прозрачность",
        hint: "Модификатор с плюсом и минусом.",
        kind: HotkeyKind::ModifierPlusMinus,
        scope: HotkeyScope::Hud,
        default_combo: primary_combo!(shift_token!()),
    },
    HotkeyAction {
        id: ACTION_SCROLL_CHAT,
        group: "Чат",
        label: "Скролл переписки",
        hint: "Модификатор со стрелками вверх и вниз.",
        kind: HotkeyKind::ModifierArrows,
        scope: HotkeyScope::Hud,
        default_combo: PlatformCombo::shared(MODIFIER_ALT),
    },
    HotkeyAction {
        id: ACTION_TELEPROMPTER,
        group: "Чат",
        label: "Суфлёр",
        hint: "Крупный текст ответа поверх экрана.",
        kind: HotkeyKind::Combo,
        scope: HotkeyScope::Global,
        default_combo: PlatformCombo::shared("F10"),
    },
    HotkeyAction {
        id: ACTION_TELEPROMPTER_CLOSE,
        group: "Суфлёр",
        label: "Закрыть суфлёр",
        hint: "Слушается только пока суфлёр открыт.",
        kind: HotkeyKind::Combo,
        scope: HotkeyScope::Teleprompter,
        default_combo: PlatformCombo::shared("Escape"),
    },
    HotkeyAction {
        id: ACTION_TELEPROMPTER_PAUSE,
        group: "Суфлёр",
        label: "Пауза суфлёра",
        hint: "Останавливает автопрокрутку.",
        kind: HotkeyKind::Combo,
        scope: HotkeyScope::Teleprompter,
        default_combo: PlatformCombo::shared("Space"),
    },
];

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct HotkeyBinding {
    pub action: String,
    pub combo: String,
}

pub fn action(id: &str) -> Option<&'static HotkeyAction> {
    HOTKEY_ACTIONS.iter().find(|a| a.id == id)
}

pub fn effective(bindings: &[HotkeyBinding], id: &str) -> String {
    if let Some(binding) = bindings.iter().rev().find(|b| b.action == id) {
        return binding.combo.clone();
    }
    action(id).map(|a| a.default_combo.current().to_string()).unwrap_or_default()
}

fn split_combo(combo: &str) -> (Vec<String>, Option<String>) {
    let mut modifiers = Vec::new();
    let mut key = None;
    for raw in combo.split(COMBO_SEPARATOR) {
        let token = raw.trim();
        if token.is_empty() {
            continue;
        }
        match MODIFIER_TOKENS
            .iter()
            .find(|m| m.eq_ignore_ascii_case(token))
        {
            Some(canonical) => {
                if !modifiers.iter().any(|m: &String| m == canonical) {
                    modifiers.push((*canonical).to_string());
                }
            }
            None => key = Some(token.to_string()),
        }
    }
    modifiers.sort();
    (modifiers, key)
}

fn canonical_key(token: &str) -> String {
    let upper = token.trim().to_ascii_uppercase();
    for prefix in ["KEY", "DIGIT"] {
        if let Some(rest) = upper.strip_prefix(prefix) {
            if rest.chars().count() == 1 {
                return rest.to_string();
            }
        }
    }
    upper
}

fn keys_equal(a: &Option<String>, b: &Option<String>) -> bool {
    match (a, b) {
        (Some(a), Some(b)) => canonical_key(a) == canonical_key(b),
        (None, None) => true,
        _ => false,
    }
}

fn is_arrow(key: &str) -> bool {
    ARROW_KEYS.iter().any(|k| k.eq_ignore_ascii_case(key))
}

fn is_plus_minus(key: &str) -> bool {
    PLUS_MINUS_KEYS.iter().any(|k| k.eq_ignore_ascii_case(key))
}

fn is_digit(key: &str) -> bool {
    canonical_key(key)
        .parse::<usize>()
        .is_ok_and(|digit| (FIRST_DIGIT_KEY..=crate::settings::QUICK_ACTION_LIMIT).contains(&digit))
}

fn scopes_coexist(a: HotkeyScope, b: HotkeyScope) -> bool {
    !matches!(
        (a, b),
        (HotkeyScope::Recording, HotkeyScope::Teleprompter)
            | (HotkeyScope::Teleprompter, HotkeyScope::Recording)
    )
}

fn key_spaces_overlap(a: &HotkeyAction, combo_a: &str, b: &HotkeyAction, combo_b: &str) -> bool {
    if combo_a.trim().is_empty() || combo_b.trim().is_empty() {
        return false;
    }
    let (mods_a, key_a) = split_combo(combo_a);
    let (mods_b, key_b) = split_combo(combo_b);
    match (a.kind, b.kind) {
        (HotkeyKind::Combo, HotkeyKind::Combo) => mods_a == mods_b && keys_equal(&key_a, &key_b),
        (HotkeyKind::ModifierArrows, HotkeyKind::ModifierArrows)
        | (HotkeyKind::ModifierPlusMinus, HotkeyKind::ModifierPlusMinus)
        | (HotkeyKind::ModifierDigits, HotkeyKind::ModifierDigits) => mods_a == mods_b,
        (HotkeyKind::ModifierArrows, HotkeyKind::ModifierPlusMinus)
        | (HotkeyKind::ModifierPlusMinus, HotkeyKind::ModifierArrows)
        | (HotkeyKind::ModifierArrows, HotkeyKind::ModifierDigits)
        | (HotkeyKind::ModifierDigits, HotkeyKind::ModifierArrows)
        | (HotkeyKind::ModifierPlusMinus, HotkeyKind::ModifierDigits)
        | (HotkeyKind::ModifierDigits, HotkeyKind::ModifierPlusMinus) => false,
        (HotkeyKind::Combo, HotkeyKind::ModifierArrows) => {
            mods_a == mods_b && key_a.as_deref().is_some_and(is_arrow)
        }
        (HotkeyKind::ModifierArrows, HotkeyKind::Combo) => {
            mods_a == mods_b && key_b.as_deref().is_some_and(is_arrow)
        }
        (HotkeyKind::Combo, HotkeyKind::ModifierPlusMinus) => {
            mods_a == mods_b && key_a.as_deref().is_some_and(is_plus_minus)
        }
        (HotkeyKind::ModifierPlusMinus, HotkeyKind::Combo) => {
            mods_a == mods_b && key_b.as_deref().is_some_and(is_plus_minus)
        }
        (HotkeyKind::Combo, HotkeyKind::ModifierDigits) => {
            mods_a == mods_b && key_a.as_deref().is_some_and(is_digit)
        }
        (HotkeyKind::ModifierDigits, HotkeyKind::Combo) => {
            mods_a == mods_b && key_b.as_deref().is_some_and(is_digit)
        }
    }
}

pub fn conflict(a_id: &str, combo_a: &str, b_id: &str, combo_b: &str) -> bool {
    if a_id == b_id {
        return false;
    }
    let (Some(a), Some(b)) = (action(a_id), action(b_id)) else {
        return false;
    };
    scopes_coexist(a.scope, b.scope) && key_spaces_overlap(a, combo_a, b, combo_b)
}

pub fn normalize(bindings: &mut Vec<HotkeyBinding>) {
    let mut claimed: Vec<(&'static str, String)> = Vec::new();
    for binding in bindings.iter().rev() {
        let Some(action) = action(&binding.action) else { continue };
        if claimed.iter().any(|(id, _)| *id == action.id) {
            continue;
        }
        claimed.push((action.id, binding.combo.trim().to_string()));
    }
    for action in HOTKEY_ACTIONS {
        if !claimed.iter().any(|(id, _)| *id == action.id) {
            claimed.push((action.id, action.default_combo.current().to_string()));
        }
    }

    let mut accepted: Vec<(&'static str, String)> = Vec::new();
    for (id, combo) in claimed {
        let taken = accepted
            .iter()
            .any(|(kept_id, kept_combo)| conflict(id, &combo, kept_id, kept_combo));
        accepted.push((id, if taken { String::new() } else { combo }));
    }

    *bindings = HOTKEY_ACTIONS
        .iter()
        .filter_map(|action| {
            let combo = accepted
                .iter()
                .find(|(id, _)| *id == action.id)
                .map(|(_, combo)| combo.clone())
                .unwrap_or_else(|| action.default_combo.current().to_string());
            (combo != action.default_combo.current())
                .then(|| HotkeyBinding { action: action.id.to_string(), combo })
        })
        .collect();
}

const LEGACY_FIELDS: &[(&str, &str)] = &[
    ("hotkey", ACTION_RECORD),
    ("toggle_hotkey", ACTION_TOGGLE_WINDOW),
    ("teleprompter_hotkey", ACTION_TELEPROMPTER),
    ("screenshot_hotkey", ACTION_SCREENSHOT),
    ("move_modifier", ACTION_MOVE_WINDOW),
    ("resize_modifier", ACTION_RESIZE_WINDOW),
    ("scroll_modifier", ACTION_SCROLL_CHAT),
];

const HOTKEYS_FIELD: &str = "hotkeys";

pub fn migrate_legacy_fields(raw: &mut serde_json::Value) {
    let Some(object) = raw.as_object_mut() else {
        return;
    };
    let already_migrated = object
        .get(HOTKEYS_FIELD)
        .and_then(|v| v.as_array())
        .is_some_and(|a| !a.is_empty());

    let mut migrated = Vec::new();
    for (legacy, action_id) in LEGACY_FIELDS {
        let Some(value) = object.remove(*legacy) else {
            continue;
        };
        if already_migrated {
            continue;
        }
        let Some(combo) = value.as_str() else { continue };
        let combo = combo.trim();
        if combo.is_empty() || combo == effective(&[], action_id) {
            continue;
        }
        migrated.push(serde_json::json!({ "action": action_id, "combo": combo }));
    }
    if !migrated.is_empty() {
        object.insert(HOTKEYS_FIELD.to_string(), serde_json::Value::Array(migrated));
    }
}

#[cfg(test)]
mod tests;
