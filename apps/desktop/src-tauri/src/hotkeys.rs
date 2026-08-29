use serde::{Deserialize, Serialize};

pub const ACTION_RECORD: &str = "record";
pub const ACTION_AUTO_MODE: &str = "auto_mode";
pub const ACTION_CANCEL_RECORDING: &str = "cancel_recording";
pub const ACTION_SEND: &str = "send";
pub const ACTION_AUTO_ANSWER: &str = "auto_answer";
pub const ACTION_SCREENSHOT: &str = "screenshot";
pub const ACTION_QUICK_ACTION: &str = "quick_action";
pub const ACTION_FOCUS_PROMPT: &str = "focus_prompt";
pub const ACTION_TOGGLE_WINDOW: &str = "toggle_window";
pub const ACTION_MOVE_WINDOW: &str = "move_window";
pub const ACTION_RESIZE_WINDOW: &str = "resize_window";
pub const ACTION_OPACITY: &str = "opacity";
pub const ACTION_SCROLL_CHAT: &str = "scroll_chat";
pub const ACTION_DUPLICATE_CHAT: &str = "duplicate_chat";
pub const ACTION_TELEPROMPTER: &str = "teleprompter";
pub const ACTION_TELEPROMPTER_CLOSE: &str = "teleprompter_close";
pub const ACTION_TELEPROMPTER_PAUSE: &str = "teleprompter_pause";

/// The five headings the reference groups actions under. Keys, not text: the
/// frontend looks each one up in `src/i18n`, so `bindings.ts` stays free of any
/// user-facing phrase — see the `HotkeyAction` comment.
pub const GROUP_RECORDING: &str = "recording";
pub const GROUP_SENDING: &str = "sending";
pub const GROUP_WINDOW: &str = "window";
pub const GROUP_CHAT: &str = "chat";
pub const GROUP_TELEPROMPTER: &str = "teleprompter";

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

    /// The pair travels to the frontend whole (see the identical-`bindings.ts`
    /// invariant); only Rust ever asks for "the current one".
    pub fn current(&self) -> &'static str {
        #[cfg(target_os = "macos")]
        {
            self.macos
        }
        #[cfg(target_os = "windows")]
        {
            self.windows
        }
        // Without this the body is two `#[cfg]` blocks and nothing else, so on a
        // third OS the function returns `()` where `&'static str` is declared —
        // a type error pointing at the wrong thing. The shape of the constant
        // itself is contract and must not gain a third field.
        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        compile_error!(
            "PlatformCombo::current: неизвестная ОС — добавьте поле в PlatformCombo \
             и обновите контракт на фронте (SameShape<Record<Platform, string>, …>)"
        );
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
        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        compile_error!(
            "PlatformModifierCombos::current: неизвестная ОС — добавьте поле в \
             PlatformModifierCombos и обновите MODIFIER_COMBOS на фронте"
        );
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

/// One keyboard command, described without a word of prose.
///
/// `label`/`group`/`hint` used to be Russian sentences here, and they travelled
/// into `bindings.ts` verbatim — which made the generated contract a translation
/// unit and put the interface's language in Rust. They are keys now: the
/// frontend resolves `label_key`/`hint_key` in `dict.hotkeys.actions` and
/// `group_key` in `dict.hotkeys.groups`, and an untranslated action fails
/// `tsc` rather than showing up blank.
///
/// `label_key` and `hint_key` both hold the action's own id, and the redundancy
/// with `id` is deliberate: `id` is identity (what a `HotkeyBinding` names, what
/// `effective` looks up), while the key fields are the contract that says these
/// two texts live in the dictionary. Nothing is copied — they are the same
/// `ACTION_*` constant — and the frontend never has to assume that "the
/// dictionary happens to be keyed by id".
#[derive(Debug, Clone, Copy, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct HotkeyAction {
    pub id: &'static str,
    pub group_key: &'static str,
    pub label_key: &'static str,
    pub hint_key: &'static str,
    pub kind: HotkeyKind,
    pub scope: HotkeyScope,
    pub default_combo: PlatformCombo,
}

pub const HOTKEY_ACTIONS: &[HotkeyAction] = &[
    HotkeyAction {
        id: ACTION_RECORD,
        group_key: GROUP_RECORDING,
        label_key: ACTION_RECORD,
        hint_key: ACTION_RECORD,
        kind: HotkeyKind::Combo,
        scope: HotkeyScope::Global,
        default_combo: primary_combo!("R"),
    },
    HotkeyAction {
        id: ACTION_AUTO_MODE,
        group_key: GROUP_RECORDING,
        label_key: ACTION_AUTO_MODE,
        hint_key: ACTION_AUTO_MODE,
        kind: HotkeyKind::Combo,
        scope: HotkeyScope::Global,
        default_combo: primary_combo!(shift_token!(), "L"),
    },
    HotkeyAction {
        id: ACTION_CANCEL_RECORDING,
        group_key: GROUP_RECORDING,
        label_key: ACTION_CANCEL_RECORDING,
        hint_key: ACTION_CANCEL_RECORDING,
        kind: HotkeyKind::Combo,
        scope: HotkeyScope::Recording,
        default_combo: PlatformCombo::shared("Escape"),
    },
    HotkeyAction {
        id: ACTION_SEND,
        group_key: GROUP_SENDING,
        label_key: ACTION_SEND,
        hint_key: ACTION_SEND,
        kind: HotkeyKind::Combo,
        scope: HotkeyScope::Hud,
        default_combo: primary_combo!("Enter"),
    },
    HotkeyAction {
        id: ACTION_AUTO_ANSWER,
        group_key: GROUP_SENDING,
        label_key: ACTION_AUTO_ANSWER,
        hint_key: ACTION_AUTO_ANSWER,
        kind: HotkeyKind::Combo,
        scope: HotkeyScope::Global,
        default_combo: primary_combo!(shift_token!(), "Enter"),
    },
    HotkeyAction {
        id: ACTION_SCREENSHOT,
        group_key: GROUP_SENDING,
        label_key: ACTION_SCREENSHOT,
        hint_key: ACTION_SCREENSHOT,
        kind: HotkeyKind::Combo,
        scope: HotkeyScope::Global,
        default_combo: primary_combo!(shift_token!(), "A"),
    },
    HotkeyAction {
        id: ACTION_QUICK_ACTION,
        group_key: GROUP_SENDING,
        label_key: ACTION_QUICK_ACTION,
        hint_key: ACTION_QUICK_ACTION,
        kind: HotkeyKind::ModifierDigits,
        scope: HotkeyScope::Hud,
        default_combo: primary_combo!(),
    },
    HotkeyAction {
        id: ACTION_FOCUS_PROMPT,
        group_key: GROUP_SENDING,
        label_key: ACTION_FOCUS_PROMPT,
        hint_key: ACTION_FOCUS_PROMPT,
        kind: HotkeyKind::Combo,
        scope: HotkeyScope::Global,
        default_combo: primary_combo!(shift_token!(), "D"),
    },
    HotkeyAction {
        id: ACTION_TOGGLE_WINDOW,
        group_key: GROUP_WINDOW,
        label_key: ACTION_TOGGLE_WINDOW,
        hint_key: ACTION_TOGGLE_WINDOW,
        kind: HotkeyKind::Combo,
        scope: HotkeyScope::Global,
        default_combo: primary_combo!(shift_token!(), "H"),
    },
    HotkeyAction {
        id: ACTION_MOVE_WINDOW,
        group_key: GROUP_WINDOW,
        label_key: ACTION_MOVE_WINDOW,
        hint_key: ACTION_MOVE_WINDOW,
        kind: HotkeyKind::ModifierArrows,
        scope: HotkeyScope::Hud,
        default_combo: primary_combo!(),
    },
    HotkeyAction {
        id: ACTION_RESIZE_WINDOW,
        group_key: GROUP_WINDOW,
        label_key: ACTION_RESIZE_WINDOW,
        hint_key: ACTION_RESIZE_WINDOW,
        kind: HotkeyKind::ModifierArrows,
        scope: HotkeyScope::Hud,
        default_combo: primary_combo!(shift_token!()),
    },
    HotkeyAction {
        id: ACTION_OPACITY,
        group_key: GROUP_WINDOW,
        label_key: ACTION_OPACITY,
        hint_key: ACTION_OPACITY,
        kind: HotkeyKind::ModifierPlusMinus,
        scope: HotkeyScope::Hud,
        default_combo: primary_combo!(shift_token!()),
    },
    HotkeyAction {
        id: ACTION_SCROLL_CHAT,
        group_key: GROUP_CHAT,
        label_key: ACTION_SCROLL_CHAT,
        hint_key: ACTION_SCROLL_CHAT,
        kind: HotkeyKind::ModifierArrows,
        scope: HotkeyScope::Hud,
        default_combo: PlatformCombo::shared(MODIFIER_ALT),
    },
    HotkeyAction {
        id: ACTION_DUPLICATE_CHAT,
        group_key: GROUP_CHAT,
        label_key: ACTION_DUPLICATE_CHAT,
        hint_key: ACTION_DUPLICATE_CHAT,
        kind: HotkeyKind::Combo,
        scope: HotkeyScope::Hud,
        default_combo: primary_combo!(shift_token!(), "N"),
    },
    HotkeyAction {
        id: ACTION_TELEPROMPTER,
        group_key: GROUP_CHAT,
        label_key: ACTION_TELEPROMPTER,
        hint_key: ACTION_TELEPROMPTER,
        kind: HotkeyKind::Combo,
        scope: HotkeyScope::Global,
        default_combo: primary_combo!(shift_token!(), "T"),
    },
    HotkeyAction {
        id: ACTION_TELEPROMPTER_CLOSE,
        group_key: GROUP_TELEPROMPTER,
        label_key: ACTION_TELEPROMPTER_CLOSE,
        hint_key: ACTION_TELEPROMPTER_CLOSE,
        kind: HotkeyKind::Combo,
        scope: HotkeyScope::Teleprompter,
        default_combo: PlatformCombo::shared("Escape"),
    },
    HotkeyAction {
        id: ACTION_TELEPROMPTER_PAUSE,
        group_key: GROUP_TELEPROMPTER,
        label_key: ACTION_TELEPROMPTER_PAUSE,
        hint_key: ACTION_TELEPROMPTER_PAUSE,
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

/// One combo, taken apart exactly once.
///
/// `normalize` compares every action against every other one — around 150 pairs
/// — and the comparison used to `split_combo` both sides on every pass, which
/// meant ~300 vectors and about a thousand short strings per settings save,
/// inside the mutex that also holds the fsync. The parts a comparison can ask
/// for are all decided here instead, so the pairwise loop allocates nothing.
///
/// `key` is stored already canonicalised (`KeyA` → `A`), because equality
/// between two `Combo` bindings is defined on the canonical form.
struct ComboParts {
    /// An empty combo is "unbound" and can never collide with anything.
    blank: bool,
    modifiers: Vec<String>,
    key: Option<String>,
    arrow: bool,
    plus_minus: bool,
    digit: bool,
}

impl ComboParts {
    fn new(combo: &str) -> Self {
        let blank = combo.trim().is_empty();
        let (modifiers, key) = split_combo(combo);
        Self {
            blank,
            arrow: key.as_deref().is_some_and(is_arrow),
            plus_minus: key.as_deref().is_some_and(is_plus_minus),
            digit: key.as_deref().is_some_and(is_digit),
            key: key.map(|k| canonical_key(&k)),
            modifiers,
        }
    }
}

fn key_spaces_overlap(a: &HotkeyAction, pa: &ComboParts, b: &HotkeyAction, pb: &ComboParts) -> bool {
    if pa.blank || pb.blank {
        return false;
    }
    let same_modifiers = pa.modifiers == pb.modifiers;
    match (a.kind, b.kind) {
        (HotkeyKind::Combo, HotkeyKind::Combo) => same_modifiers && pa.key == pb.key,
        (HotkeyKind::ModifierArrows, HotkeyKind::ModifierArrows)
        | (HotkeyKind::ModifierPlusMinus, HotkeyKind::ModifierPlusMinus)
        | (HotkeyKind::ModifierDigits, HotkeyKind::ModifierDigits) => same_modifiers,
        (HotkeyKind::ModifierArrows, HotkeyKind::ModifierPlusMinus)
        | (HotkeyKind::ModifierPlusMinus, HotkeyKind::ModifierArrows)
        | (HotkeyKind::ModifierArrows, HotkeyKind::ModifierDigits)
        | (HotkeyKind::ModifierDigits, HotkeyKind::ModifierArrows)
        | (HotkeyKind::ModifierPlusMinus, HotkeyKind::ModifierDigits)
        | (HotkeyKind::ModifierDigits, HotkeyKind::ModifierPlusMinus) => false,
        (HotkeyKind::Combo, HotkeyKind::ModifierArrows) => same_modifiers && pa.arrow,
        (HotkeyKind::ModifierArrows, HotkeyKind::Combo) => same_modifiers && pb.arrow,
        (HotkeyKind::Combo, HotkeyKind::ModifierPlusMinus) => same_modifiers && pa.plus_minus,
        (HotkeyKind::ModifierPlusMinus, HotkeyKind::Combo) => same_modifiers && pb.plus_minus,
        (HotkeyKind::Combo, HotkeyKind::ModifierDigits) => same_modifiers && pa.digit,
        (HotkeyKind::ModifierDigits, HotkeyKind::Combo) => same_modifiers && pb.digit,
    }
}

fn actions_collide(a: &HotkeyAction, pa: &ComboParts, b: &HotkeyAction, pb: &ComboParts) -> bool {
    a.id != b.id && scopes_coexist(a.scope, b.scope) && key_spaces_overlap(a, pa, b, pb)
}

pub fn conflict(a_id: &str, combo_a: &str, b_id: &str, combo_b: &str) -> bool {
    if a_id == b_id {
        return false;
    }
    let (Some(a), Some(b)) = (action(a_id), action(b_id)) else {
        return false;
    };
    actions_collide(a, &ComboParts::new(combo_a), b, &ComboParts::new(combo_b))
}

/// A combo that lost a conflict is cleared, and a cleared combo collides with
/// nothing — so the entry stays in `accepted` (later actions still have to see
/// that this one is settled) with parts that can never match.
fn unbound_parts() -> ComboParts {
    ComboParts::new("")
}

pub fn normalize(bindings: &mut Vec<HotkeyBinding>) {
    // The action is carried as a `&'static` reference rather than looked up by
    // id inside the comparison: `conflict` used to run two linear scans of
    // `HOTKEY_ACTIONS` for every one of the ~150 pairs.
    let mut claimed: Vec<(&'static HotkeyAction, String)> = Vec::new();
    for binding in bindings.iter().rev() {
        let Some(action) = action(&binding.action) else { continue };
        if claimed.iter().any(|(kept, _)| kept.id == action.id) {
            continue;
        }
        claimed.push((action, binding.combo.trim().to_string()));
    }
    for action in HOTKEY_ACTIONS {
        if !claimed.iter().any(|(kept, _)| kept.id == action.id) {
            claimed.push((action, action.default_combo.current().to_string()));
        }
    }

    let mut accepted: Vec<(&'static HotkeyAction, String, ComboParts)> =
        Vec::with_capacity(claimed.len());
    for (action, combo) in claimed {
        let parts = ComboParts::new(&combo);
        let taken = accepted
            .iter()
            .any(|(kept, _, kept_parts)| actions_collide(action, &parts, kept, kept_parts));
        if taken {
            accepted.push((action, String::new(), unbound_parts()));
        } else {
            accepted.push((action, combo, parts));
        }
    }

    *bindings = HOTKEY_ACTIONS
        .iter()
        .filter_map(|action| {
            let combo = accepted
                .iter()
                .find(|(kept, _, _)| kept.id == action.id)
                .map(|(_, combo, _)| combo.clone())
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
