use std::sync::OnceLock;

use tauri::AppHandle;
use windows::core::{w, PCWSTR};
use windows::Win32::Foundation::{HINSTANCE, HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::Graphics::Dwm::{
    DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_COLOR_NONE, DWMWA_DISALLOW_PEEK,
    DWMWA_EXCLUDED_FROM_PEEK, DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_ROUND, DWMWINDOWATTRIBUTE,
};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, VIRTUAL_KEY, VK_CONTROL, VK_DOWN, VK_LEFT, VK_LWIN, VK_MENU, VK_RIGHT,
    VK_RWIN, VK_SHIFT, VK_UP,
};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::Shell::ShellExecuteW;
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, GetAncestor, GetForegroundWindow, GetWindowDisplayAffinity, GetWindowLongPtrW,
    SetWindowDisplayAffinity, SetWindowLongPtrW, SetWindowPos, SetWindowsHookExW, GA_ROOTOWNER,
    GWL_EXSTYLE, HC_ACTION, KBDLLHOOKSTRUCT, SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE,
    SWP_NOSIZE, SWP_NOZORDER, SW_SHOWNORMAL, WDA_EXCLUDEFROMCAPTURE, WDA_NONE,
    WH_KEYBOARD_LL, WM_KEYDOWN, WM_SYSKEYDOWN, WS_EX_APPWINDOW, WS_EX_TOOLWINDOW,
};

use super::{handle_arrow_key, ModifierMask};
use crate::window::main_window;

const KEY_PRESSED_MASK: u16 = 0x8000;
const SWALLOW_EVENT: LRESULT = LRESULT(1);
const AUDIO_PRIVACY_PANE_URL: PCWSTR = w!("ms-settings:privacy-microphone");
const SCREEN_PRIVACY_PANE_URL: PCWSTR = w!("ms-settings:privacy");
const SHELL_OPEN_VERB: PCWSTR = w!("open");

static HOOK_APP: OnceLock<AppHandle> = OnceLock::new();

pub fn disable_cursor_autohide_on_typing() {}

pub fn merge_titlebar_into_content(_app: &AppHandle) {}

fn stealth_extended_style(current: isize) -> isize {
    (current | WS_EX_TOOLWINDOW.0 as isize) & !(WS_EX_APPWINDOW.0 as isize)
}

/// Removes the HUD from normal Windows shell surfaces and verifies the native
/// capture-affinity flag. The window stays focusable: WS_EX_NOACTIVATE is
/// intentionally not used because the prompt must still accept keyboard input.
pub fn configure_overlay_stealth(app: &AppHandle, protect_content: bool) -> Result<(), String> {
    let w = main_window(app).ok_or_else(|| "окно HUD не найдено".to_string())?;
    w.set_skip_taskbar(true).map_err(|e| e.to_string())?;
    let hwnd = w.hwnd().map_err(|e| e.to_string())?;

    let current_style = unsafe { GetWindowLongPtrW(hwnd, GWL_EXSTYLE) };
    let desired_style = stealth_extended_style(current_style);
    if desired_style != current_style {
        unsafe {
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, desired_style);
            SetWindowPos(
                hwnd,
                None,
                0,
                0,
                0,
                0,
                SWP_FRAMECHANGED | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE,
            )
        }
        .map_err(|e| e.to_string())?;
    }

    let applied_style = unsafe { GetWindowLongPtrW(hwnd, GWL_EXSTYLE) };
    if applied_style & WS_EX_TOOLWINDOW.0 as isize == 0
        || applied_style & WS_EX_APPWINDOW.0 as isize != 0
    {
        return Err("Windows не применил stealth-стили HUD".into());
    }

    let enabled = 1u32;
    set_dwm_attribute(hwnd, DWMWA_DISALLOW_PEEK, &enabled);
    set_dwm_attribute(hwnd, DWMWA_EXCLUDED_FROM_PEEK, &enabled);

    let desired_affinity = if protect_content {
        WDA_EXCLUDEFROMCAPTURE
    } else {
        WDA_NONE
    };
    unsafe { SetWindowDisplayAffinity(hwnd, desired_affinity) }.map_err(|e| e.to_string())?;
    let mut applied_affinity = 0u32;
    unsafe { GetWindowDisplayAffinity(hwnd, &mut applied_affinity) }.map_err(|e| e.to_string())?;
    if applied_affinity != desired_affinity.0 {
        return Err(format!(
            "Windows применил display affinity {applied_affinity:#x} вместо {:#x}",
            desired_affinity.0
        ));
    }
    Ok(())
}

fn set_dwm_attribute<T>(hwnd: HWND, attribute: DWMWINDOWATTRIBUTE, value: &T) {
    let _ = unsafe {
        DwmSetWindowAttribute(
            hwnd,
            attribute,
            std::ptr::from_ref(value).cast(),
            std::mem::size_of::<T>() as u32,
        )
    };
}

pub fn clip_native_window_corners(app: &AppHandle) {
    let Some(w) = main_window(app) else {
        return;
    };
    let Ok(hwnd) = w.hwnd() else {
        return;
    };
    set_dwm_attribute(hwnd, DWMWA_WINDOW_CORNER_PREFERENCE, &DWMWCP_ROUND);
    set_dwm_attribute(hwnd, DWMWA_BORDER_COLOR, &DWMWA_COLOR_NONE);
}

fn key_pressed(key: VIRTUAL_KEY) -> bool {
    (unsafe { GetAsyncKeyState(key.0 as i32) } as u16 & KEY_PRESSED_MASK) != 0
}

fn pressed_modifiers() -> ModifierMask {
    let mut mask = ModifierMask::EMPTY;
    if key_pressed(VK_LWIN) || key_pressed(VK_RWIN) {
        mask |= ModifierMask::CMD;
    }
    if key_pressed(VK_CONTROL) {
        mask |= ModifierMask::CTRL;
    }
    if key_pressed(VK_MENU) {
        mask |= ModifierMask::ALT;
    }
    if key_pressed(VK_SHIFT) {
        mask |= ModifierMask::SHIFT;
    }
    mask
}

fn arrow_delta(virtual_key: u32) -> Option<(i32, i32)> {
    match VIRTUAL_KEY(virtual_key as u16) {
        VK_LEFT => Some((-1, 0)),
        VK_RIGHT => Some((1, 0)),
        VK_DOWN => Some((0, 1)),
        VK_UP => Some((0, -1)),
        _ => None,
    }
}

fn is_key_down(message: WPARAM) -> bool {
    message.0 as u32 == WM_KEYDOWN || message.0 as u32 == WM_SYSKEYDOWN
}

fn hud_is_focused(app: &AppHandle) -> bool {
    let Some(w) = main_window(app) else {
        return false;
    };
    let Ok(hwnd) = w.hwnd() else {
        return false;
    };
    let foreground = unsafe { GetForegroundWindow() };
    let owner = unsafe { GetAncestor(foreground, GA_ROOTOWNER) };
    foreground == hwnd || owner == hwnd
}

unsafe extern "system" fn arrow_keys_hook(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code == HC_ACTION as i32 && is_key_down(wparam) {
        let event = unsafe { &*(lparam.0 as *const KBDLLHOOKSTRUCT) };
        if let (Some((dx, dy)), Some(app)) = (arrow_delta(event.vkCode), HOOK_APP.get()) {
            let focused = hud_is_focused(app);
            if cfg!(debug_assertions) && !focused {
                eprintln!("[стрелки] окно HUD не активно — событие пропущено дальше");
            }
            if focused && handle_arrow_key(app, pressed_modifiers(), dx, dy) {
                return SWALLOW_EVENT;
            }
        }
    }
    unsafe { CallNextHookEx(None, code, wparam, lparam) }
}

pub fn install_move_keys_monitor(app: AppHandle) {
    if HOOK_APP.set(app).is_err() {
        return;
    }
    let module = unsafe { GetModuleHandleW(None) }.map(|handle| HINSTANCE(handle.0));
    let installed =
        unsafe { SetWindowsHookExW(WH_KEYBOARD_LL, Some(arrow_keys_hook), module.ok(), 0) };
    match installed {
        Ok(_) => eprintln!("перехват стрелок установлен"),
        Err(e) => eprintln!("не удалось поставить перехват стрелок: {e}"),
    }
}

fn open_with_shell(target: PCWSTR) {
    unsafe {
        ShellExecuteW(
            None,
            SHELL_OPEN_VERB,
            target,
            PCWSTR::null(),
            PCWSTR::null(),
            SW_SHOWNORMAL,
        )
    };
}

pub fn open_audio_capture_privacy_pane() {
    open_with_shell(AUDIO_PRIVACY_PANE_URL);
}

pub fn open_screen_capture_privacy_pane() {
    open_with_shell(SCREEN_PRIVACY_PANE_URL);
}

pub fn screen_capture_access() -> bool {
    true
}

pub fn request_screen_capture_access() -> bool {
    true
}

pub fn open_url(url: &str) {
    let wide: Vec<u16> = url.encode_utf16().chain(std::iter::once(0)).collect();
    open_with_shell(PCWSTR(wide.as_ptr()));
}
