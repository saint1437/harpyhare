use std::sync::atomic::{AtomicU32, Ordering};

use tauri::{AppHandle, Manager, WebviewWindow};

use crate::events;
use crate::hotkeys;
use crate::settings::Settings;
use crate::window::main_window;

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;

/// The native glue a platform owes the facade. See `capture::CaptureBackend`
/// for why these are traits rather than a naming convention.
///
/// A call that genuinely has nothing to do on a platform is an explicit empty
/// body there (`disable_cursor_autohide_on_typing` on Windows) — never a
/// `#[cfg]` in the shared facade.
pub trait PlatformBackend {
    fn disable_cursor_autohide_on_typing();
    fn merge_titlebar_into_content(app: &AppHandle);
    fn clip_native_window_corners(app: &AppHandle);
    fn install_move_keys_monitor(app: AppHandle);
    fn open_audio_capture_privacy_pane();
    fn open_microphone_privacy_pane();
    fn open_screen_capture_privacy_pane();
    fn screen_capture_access() -> bool;
    fn request_screen_capture_access() -> bool;
    fn open_url(url: &str);
}

#[cfg(target_os = "macos")]
type Backend = macos::Backend;
#[cfg(target_os = "windows")]
type Backend = windows::Backend;

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
compile_error!(
    "нативная подложка реализована только для macOS и Windows: \
     добавьте модуль platform/<os>.rs с `impl PlatformBackend`"
);

pub const WINDOW_CORNER_RADIUS_LOGICAL_PX: f64 = 22.0;

const HTTPS_URL_PREFIX: &str = "https://";
const HTTP_URL_PREFIX: &str = "http://";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ModifierMask(u8);

const fn modifier_bit(index: usize) -> ModifierMask {
    ModifierMask(1 << index)
}

impl ModifierMask {
    pub const EMPTY: Self = Self(0);
    pub const CMD: Self = modifier_bit(0);
    pub const CTRL: Self = modifier_bit(1);
    pub const ALT: Self = modifier_bit(2);
    pub const SHIFT: Self = modifier_bit(3);

    pub fn is_empty(self) -> bool {
        self.0 == 0
    }
}

impl std::fmt::Display for ModifierMask {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let names: Vec<&str> = hotkeys::MODIFIER_TOKENS
            .iter()
            .enumerate()
            .filter(|(index, _)| self.0 & modifier_bit(*index).0 != 0)
            .map(|(_, token)| *token)
            .collect();
        if names.is_empty() {
            return f.write_str("нет");
        }
        f.write_str(&names.join(&hotkeys::COMBO_SEPARATOR.to_string()))
    }
}

impl std::ops::BitOr for ModifierMask {
    type Output = Self;

    fn bitor(self, rhs: Self) -> Self {
        Self(self.0 | rhs.0)
    }
}

impl std::ops::BitOrAssign for ModifierMask {
    fn bitor_assign(&mut self, rhs: Self) {
        self.0 |= rhs.0;
    }
}

pub fn modifier_mask(spec: &str) -> ModifierMask {
    let mut mask = ModifierMask::EMPTY;
    for part in spec.split(hotkeys::COMBO_SEPARATOR) {
        let token = part.trim();
        if let Some(index) = hotkeys::MODIFIER_TOKENS
            .iter()
            .position(|m| m.eq_ignore_ascii_case(token))
        {
            mask |= modifier_bit(index);
        }
    }
    mask
}

#[derive(Clone, Copy)]
enum ArrowAction {
    Move(i32),
    Resize,
}

/// Everything the arrow decision needs, in one word.
///
/// The decision is taken **inside the OS keyboard hook** — an `NSEvent` monitor
/// on macOS, a `WH_KEYBOARD_LL` hook on Windows, and Windows silently unhooks a
/// hook that outstays `LowLevelHooksTimeout`. It used to take the settings lock,
/// deep-clone the whole `Settings` (prompt preset texts included), build two
/// `String`s through `hotkeys::effective` and parse both of them — on every
/// arrow press with a modifier held, key repeat included. All three inputs are
/// `Copy`-sized, so they live in one atomic that the hook reads and nothing else
/// touches; the derivation runs on the settings-change path instead
/// (`preferences::SettingsEffect::RefreshArrowKeys`, seeded at startup).
///
/// An unwritten snapshot is two empty masks, and an empty mask matches no
/// non-empty modifier state — the same "no decision" the contended lock used to
/// produce.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct ArrowKeys {
    move_mask: ModifierMask,
    resize_mask: ModifierMask,
    move_step: u32,
}

/// The layout of the packed word: two 8-bit masks, then the step. `move_step` is
/// clamped to `limits::window::MOVE_STEP` (max 200) long before it gets here.
const ARROW_MASK_BITS: u32 = 0xff;
const ARROW_RESIZE_MASK_SHIFT: u32 = 8;
const ARROW_MOVE_STEP_SHIFT: u32 = 16;
const ARROW_MOVE_STEP_BITS: u32 = 0xffff;

static ARROW_KEYS: AtomicU32 = AtomicU32::new(0);

impl ArrowKeys {
    fn pack(self) -> u32 {
        u32::from(self.move_mask.0)
            | (u32::from(self.resize_mask.0) << ARROW_RESIZE_MASK_SHIFT)
            | ((self.move_step & ARROW_MOVE_STEP_BITS) << ARROW_MOVE_STEP_SHIFT)
    }

    fn unpack(bits: u32) -> Self {
        Self {
            move_mask: ModifierMask((bits & ARROW_MASK_BITS) as u8),
            resize_mask: ModifierMask(((bits >> ARROW_RESIZE_MASK_SHIFT) & ARROW_MASK_BITS) as u8),
            move_step: (bits >> ARROW_MOVE_STEP_SHIFT) & ARROW_MOVE_STEP_BITS,
        }
    }

    fn of(settings: &Settings) -> Self {
        Self {
            move_mask: modifier_mask(&hotkeys::effective(
                &settings.hotkeys,
                hotkeys::ACTION_MOVE_WINDOW,
            )),
            resize_mask: modifier_mask(&hotkeys::effective(
                &settings.hotkeys,
                hotkeys::ACTION_RESIZE_WINDOW,
            )),
            move_step: settings.move_step,
        }
    }
}

/// Re-derives what the keyboard hook reads. The only writer.
pub fn refresh_arrow_keys(settings: &Settings) {
    ARROW_KEYS.store(ArrowKeys::of(settings).pack(), Ordering::Release);
}

fn arrow_action(active: ModifierMask) -> Option<ArrowAction> {
    if active.is_empty() {
        return None;
    }
    let keys = ArrowKeys::unpack(ARROW_KEYS.load(Ordering::Acquire));
    if cfg!(debug_assertions) {
        eprintln!(
            "[стрелки] зажато {active}, сдвиг на {}, размер на {}",
            keys.move_mask, keys.resize_mask
        );
    }
    if active == keys.move_mask {
        return Some(ArrowAction::Move(keys.move_step as i32));
    }
    if active == keys.resize_mask {
        return Some(ArrowAction::Resize);
    }
    None
}

fn apply_arrow_action(window: &WebviewWindow, action: ArrowAction, dx: i32, dy: i32) {
    match action {
        ArrowAction::Move(step) => {
            if let Ok(pos) = window.outer_position() {
                let _ = window.set_position(tauri::PhysicalPosition::new(
                    pos.x + dx * step,
                    pos.y + dy * step,
                ));
            }
        }
        ArrowAction::Resize => events::resize_key(window.app_handle(), dx, dy),
    }
}

fn dispatch_arrow_action(window: &WebviewWindow, action: ArrowAction, dx: i32, dy: i32) {
    // `run_on_main_thread` posts to the event loop and returns at once, so the
    // async task that used to wrap it bought nothing and cost one spawn per
    // keypress — with key repeat, dozens a second.
    let target = window.clone();
    let _ = window
        .app_handle()
        .run_on_main_thread(move || apply_arrow_action(&target, action, dx, dy));
}

/// The macOS monitor's entry point. It has no focus test of its own, so the HUD
/// is resolved here — once, and only after the modifiers have already matched:
/// bare arrows travel through this hook on every keystroke and must not pay for
/// a window lookup.
pub fn handle_arrow_key(app: &AppHandle, active: ModifierMask, dx: i32, dy: i32) -> bool {
    let Some(action) = arrow_action(active) else {
        return false;
    };
    let Some(window) = main_window(app) else {
        return false;
    };
    dispatch_arrow_action(&window, action, dx, dy);
    true
}

/// The Windows hook's entry point: it has to resolve the HUD anyway to answer
/// "is it focused", so it hands the window over rather than making the shared
/// path look it up a second and a third time.
pub fn handle_arrow_key_on(
    window: &WebviewWindow,
    active: ModifierMask,
    dx: i32,
    dy: i32,
) -> bool {
    let Some(action) = arrow_action(active) else {
        return false;
    };
    dispatch_arrow_action(window, action, dx, dy);
    true
}

pub fn disable_cursor_autohide_on_typing() {
    Backend::disable_cursor_autohide_on_typing();
}

pub fn clip_native_window_corners(app: &AppHandle) {
    Backend::clip_native_window_corners(app);
}

pub fn merge_titlebar_into_content(app: &AppHandle) {
    Backend::merge_titlebar_into_content(app);
}

pub fn install_move_keys_monitor(app: AppHandle) {
    Backend::install_move_keys_monitor(app);
}

pub fn open_audio_capture_privacy_pane() {
    Backend::open_audio_capture_privacy_pane();
}

pub fn open_microphone_privacy_pane() {
    Backend::open_microphone_privacy_pane();
}

pub fn open_screen_capture_privacy_pane() {
    Backend::open_screen_capture_privacy_pane();
}

pub fn screen_capture_access() -> bool {
    Backend::screen_capture_access()
}

pub fn request_screen_capture_access() -> bool {
    Backend::request_screen_capture_access()
}

fn is_web_url(url: &str) -> bool {
    url.starts_with(HTTPS_URL_PREFIX) || url.starts_with(HTTP_URL_PREFIX)
}

pub fn open_web_url(url: &str) {
    if is_web_url(url) {
        Backend::open_url(url);
    }
}

#[cfg(test)]
mod tests;
