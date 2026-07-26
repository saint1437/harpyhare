use tauri::{AppHandle, Manager};

use crate::app_state::App;
use crate::events;
use crate::hotkeys;
use crate::window::main_window;

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;

#[cfg(target_os = "macos")]
use macos as backend;
#[cfg(target_os = "windows")]
use windows as backend;

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

pub fn handle_arrow_key(app: &AppHandle, active: ModifierMask, dx: i32, dy: i32) -> bool {
    if active.is_empty() {
        return false;
    }
    let (move_mask, resize_mask, step) = {
        let st = app.state::<App>();
        let Ok(s) = st.settings.try_lock() else {
            return false;
        };
        (
            modifier_mask(&hotkeys::effective(&s.hotkeys, hotkeys::ACTION_MOVE_WINDOW)),
            modifier_mask(&hotkeys::effective(&s.hotkeys, hotkeys::ACTION_RESIZE_WINDOW)),
            s.move_step as i32,
        )
    };
    let Some(w) = main_window(app) else {
        return false;
    };
    if active == move_mask {
        if let Ok(pos) = w.outer_position() {
            let _ = w.set_position(tauri::PhysicalPosition::new(
                pos.x + dx * step,
                pos.y + dy * step,
            ));
        }
        return true;
    }
    if active == resize_mask {
        events::resize_key(app, dx, dy);
        return true;
    }
    false
}

pub fn disable_cursor_autohide_on_typing() {
    backend::disable_cursor_autohide_on_typing();
}

pub fn clip_native_window_corners(app: &AppHandle) {
    backend::clip_native_window_corners(app);
}

pub fn install_move_keys_monitor(app: AppHandle) {
    backend::install_move_keys_monitor(app);
}

pub fn open_audio_capture_privacy_pane() {
    backend::open_audio_capture_privacy_pane();
}

pub fn open_screen_capture_privacy_pane() {
    backend::open_screen_capture_privacy_pane();
}

pub fn screen_capture_access() -> bool {
    backend::screen_capture_access()
}

pub fn request_screen_capture_access() -> bool {
    backend::request_screen_capture_access()
}

fn is_web_url(url: &str) -> bool {
    url.starts_with(HTTPS_URL_PREFIX) || url.starts_with(HTTP_URL_PREFIX)
}

pub fn open_web_url(url: &str) {
    if is_web_url(url) {
        backend::open_url(url);
    }
}

#[cfg(test)]
mod tests;
