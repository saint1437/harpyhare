use std::ffi::c_void;
use std::sync::OnceLock;

use png::{BitDepth, ColorType, Compression, Encoder};
use windows::core::{w, PCWSTR};
use windows::Win32::Foundation::{COLORREF, HWND, LPARAM, LRESULT, POINT, RECT, WPARAM};
use windows::Win32::Graphics::Gdi::{
    AlphaBlend, BeginPaint, BitBlt, CreateCompatibleDC, CreateDIBSection, CreateSolidBrush,
    DeleteDC, DeleteObject, EndPaint, FrameRect, GdiFlush, GetDC, InvalidateRect, ReleaseDC,
    SelectObject, AC_SRC_OVER, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, BLENDFUNCTION, CAPTUREBLT,
    DIB_RGB_COLORS, HBITMAP, HDC, HGDIOBJ, PAINTSTRUCT, SRCCOPY,
};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::HiDpi::{
    SetProcessDpiAwarenessContext, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2,
};
use windows::Win32::UI::Input::KeyboardAndMouse::{SetFocus, VK_ESCAPE};
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, GetMessageW,
    GetSystemMetrics, GetWindowLongPtrW, LoadCursorW, RegisterClassW, SetForegroundWindow,
    SetWindowLongPtrW, ShowWindow, TranslateMessage, CREATESTRUCTW, GWLP_USERDATA, IDC_CROSS, MSG,
    SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN, SW_SHOW,
    WM_ERASEBKGND, WM_KEYDOWN, WM_LBUTTONDOWN, WM_LBUTTONUP, WM_MOUSEMOVE, WM_NCCREATE, WM_PAINT,
    WM_RBUTTONDOWN, WNDCLASSW, WS_EX_TOOLWINDOW, WS_EX_TOPMOST, WS_POPUP,
};

use super::resample::{self, RgbImage};

const OVERLAY_CLASS_NAME: PCWSTR = w!("HarpyRegionCaptureOverlay");
const OVERLAY_WINDOW_TITLE: PCWSTR = w!("");
const UNREGISTERED_CLASS_ATOM: u16 = 0;

const VEIL_STRENGTH_PERCENT: u32 = 45;
const FULL_PERCENT: u32 = 100;

const FRAME_THICKNESS_PX: i32 = 2;
const FRAME_RED: u32 = 217;
const FRAME_GREEN: u32 = 51;
const FRAME_BLUE: u32 = 51;
const GREEN_CHANNEL_SHIFT: u32 = 8;
const BLUE_CHANNEL_SHIFT: u32 = 16;
const FRAME_COLOR: COLORREF =
    COLORREF(FRAME_RED | (FRAME_GREEN << GREEN_CHANNEL_SHIFT) | (FRAME_BLUE << BLUE_CHANNEL_SHIFT));

const MIN_SELECTION_PX: i32 = 3;

const BITS_PER_PIXEL: u16 = 32;
const COLOR_PLANES: u16 = 1;
const SOURCE_CHANNELS: usize = 4;
const CHANNEL_BLUE: usize = 0;
const CHANNEL_GREEN: usize = 1;
const CHANNEL_RED: usize = 2;
const OUTPUT_RED_INDEX: usize = 0;
const OUTPUT_GREEN_INDEX: usize = 1;
const OUTPUT_BLUE_INDEX: usize = 2;
const MAX_ALPHA: u32 = u8::MAX as u32;
/// The veil source is one pixel that `AlphaBlend` stretches over the area being
/// darkened — see `veil_source`.
const VEIL_SOURCE_SIDE_PX: i32 = 1;
const VEIL_SOURCE_ORIGIN: i32 = 0;
const VEIL_SOURCE_CHANNEL: u8 = 0;
const NO_BLEND_FLAGS: u8 = 0;
const NO_SOURCE_ALPHA_CHANNEL: u8 = 0;
/// The clip minus the selection: a strip above, a strip below, and one on each
/// side of the hole.
const VEIL_PARTS: usize = 4;
const DIB_SECTION_OFFSET: u32 = 0;

const COORDINATE_MASK: u32 = 0xFFFF;
const COORDINATE_SHIFT: u32 = 16;

const MESSAGE_HANDLED: isize = 0;
const ERASE_HANDLED: isize = 1;
const NO_MESSAGE_FILTER: u32 = 0;
const MESSAGE_LOOP_END: i32 = 0;
const REDRAW_WITHOUT_ERASE: bool = false;
const FIRST_FRAME_RING: i32 = 1;

const SCREEN_DC_FAILED: &str = "нет доступа к экрану";
const CANVAS_FAILED: &str = "не удалось выделить буфер снимка";
const SCREEN_EMPTY: &str = "экран пустой";
const SCREEN_COPY_FAILED: &str = "не удалось снять экран";
const CLASS_FAILED: &str = "не удалось создать класс оверлея";
const WINDOW_FAILED: &str = "не удалось создать окно выделения";
const PNG_ENCODE_FAILED: &str = "не удалось закодировать PNG";

/// Main thread only, and it stops at the raw pixels on purpose: everything the
/// PNG costs happens in `encode_png`, off this thread.
pub fn capture_region() -> Result<Option<RgbImage>, String> {
    apply_dpi_awareness();
    let bounds = virtual_screen_bounds()?;
    let screen = ScreenDc::open()?;
    let original = capture_virtual_screen(&screen, &bounds)?;
    let veil = veil_source(screen.handle())?;
    let back = Canvas::create(screen.handle(), bounds.width, bounds.height)?;
    match run_overlay(&original, &veil, &back, &bounds)? {
        Some(area) => Ok(Some(crop_to_rgb(&original, area))),
        None => Ok(None),
    }
}

fn apply_dpi_awareness() {
    unsafe {
        let _ = SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    }
}

struct VirtualScreen {
    origin: POINT,
    width: i32,
    height: i32,
}

fn virtual_screen_bounds() -> Result<VirtualScreen, String> {
    let bounds = unsafe {
        VirtualScreen {
            origin: POINT {
                x: GetSystemMetrics(SM_XVIRTUALSCREEN),
                y: GetSystemMetrics(SM_YVIRTUALSCREEN),
            },
            width: GetSystemMetrics(SM_CXVIRTUALSCREEN),
            height: GetSystemMetrics(SM_CYVIRTUALSCREEN),
        }
    };
    if bounds.width <= 0 || bounds.height <= 0 {
        return Err(SCREEN_EMPTY.to_string());
    }
    Ok(bounds)
}

struct ScreenDc(HDC);

impl ScreenDc {
    fn open() -> Result<Self, String> {
        let dc = unsafe { GetDC(None) };
        if dc.is_invalid() {
            return Err(SCREEN_DC_FAILED.to_string());
        }
        Ok(Self(dc))
    }

    fn handle(&self) -> HDC {
        self.0
    }
}

impl Drop for ScreenDc {
    fn drop(&mut self) {
        unsafe {
            ReleaseDC(None, self.0);
        }
    }
}

struct Canvas {
    dc: HDC,
    bitmap: HBITMAP,
    replaced: HGDIOBJ,
    bits: *mut u8,
    width: i32,
    height: i32,
}

impl Canvas {
    fn create(reference: HDC, width: i32, height: i32) -> Result<Self, String> {
        let dc = unsafe { CreateCompatibleDC(Some(reference)) };
        if dc.is_invalid() {
            return Err(CANVAS_FAILED.to_string());
        }
        let description = top_down_bgra_description(width, height);
        let mut bits: *mut c_void = std::ptr::null_mut();
        let created = unsafe {
            CreateDIBSection(
                Some(reference),
                &description,
                DIB_RGB_COLORS,
                &mut bits,
                None,
                DIB_SECTION_OFFSET,
            )
        };
        let Ok(bitmap) = created else {
            unsafe {
                let _ = DeleteDC(dc);
            }
            return Err(CANVAS_FAILED.to_string());
        };
        if bits.is_null() {
            unsafe {
                let _ = DeleteObject(bitmap.into());
                let _ = DeleteDC(dc);
            }
            return Err(CANVAS_FAILED.to_string());
        }
        let replaced = unsafe { SelectObject(dc, bitmap.into()) };
        Ok(Self {
            dc,
            bitmap,
            replaced,
            bits: bits.cast(),
            width,
            height,
        })
    }

    fn byte_len(&self) -> usize {
        self.width as usize * self.height as usize * SOURCE_CHANNELS
    }

    fn pixels(&self) -> &[u8] {
        unsafe { std::slice::from_raw_parts(self.bits, self.byte_len()) }
    }

    fn pixels_mut(&mut self) -> &mut [u8] {
        unsafe { std::slice::from_raw_parts_mut(self.bits, self.byte_len()) }
    }
}

impl Drop for Canvas {
    fn drop(&mut self) {
        unsafe {
            SelectObject(self.dc, self.replaced);
            let _ = DeleteObject(self.bitmap.into());
            let _ = DeleteDC(self.dc);
        }
    }
}

fn top_down_bgra_description(width: i32, height: i32) -> BITMAPINFO {
    BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: width,
            biHeight: -height,
            biPlanes: COLOR_PLANES,
            biBitCount: BITS_PER_PIXEL,
            biCompression: BI_RGB.0,
            ..Default::default()
        },
        ..Default::default()
    }
}

fn capture_virtual_screen(screen: &ScreenDc, bounds: &VirtualScreen) -> Result<Canvas, String> {
    let canvas = Canvas::create(screen.handle(), bounds.width, bounds.height)?;
    unsafe {
        BitBlt(
            canvas.dc,
            0,
            0,
            bounds.width,
            bounds.height,
            Some(screen.handle()),
            bounds.origin.x,
            bounds.origin.y,
            SRCCOPY | CAPTUREBLT,
        )
        .map_err(|_| SCREEN_COPY_FAILED.to_string())?;
        let _ = GdiFlush();
    }
    Ok(canvas)
}

/// The one number the veil is specified by, spelled the way `AlphaBlend` wants
/// it. Blending an opaque BLACK source leaves `dst * (MAX_ALPHA - alpha) /
/// MAX_ALPHA`, so the alpha that keeps `kept_percent` of the screen is the
/// complement of that percentage — derived here rather than written down a
/// second time, because a veil whose two definitions disagree is a veil that
/// changes darkness the day somebody edits one of them.
const fn veil_alpha() -> u8 {
    let kept_percent = FULL_PERCENT - VEIL_STRENGTH_PERCENT;
    (MAX_ALPHA - kept_percent * MAX_ALPHA / FULL_PERCENT) as u8
}

/// The two spellings of the veil must describe the same darkness, and this is
/// where they are held together.
///
/// It is a compile-time assertion rather than a unit test because `cargo test`
/// runs on macOS and never builds this file — a `#[test]` here would be run by
/// no machine at all. `cargo clippy --all-targets` on the Windows runner (and
/// `cargo xwin` locally) evaluates it on every build. The tolerance is the
/// rounding an 8-bit alpha cannot avoid: 55% of the screen survives the blend
/// as 140/255, which reads back as 54%.
const VEIL_ROUNDING_TOLERANCE_PERCENT: u32 = 1;
const _: () = {
    let kept_percent = FULL_PERCENT - VEIL_STRENGTH_PERCENT;
    let kept_by_blend = (MAX_ALPHA - veil_alpha() as u32) * FULL_PERCENT / MAX_ALPHA;
    assert!(kept_by_blend + VEIL_ROUNDING_TOLERANCE_PERCENT >= kept_percent);
    assert!(kept_percent + VEIL_ROUNDING_TOLERANCE_PERCENT >= kept_by_blend);
};

fn veil_blend() -> BLENDFUNCTION {
    BLENDFUNCTION {
        BlendOp: AC_SRC_OVER as u8,
        BlendFlags: NO_BLEND_FLAGS,
        SourceConstantAlpha: veil_alpha(),
        // The source is opaque black and carries no alpha channel of its own:
        // the constant alpha above is the whole of the blend.
        AlphaFormat: NO_SOURCE_ALPHA_CHANNEL,
    }
}

/// One black pixel, stretched over whatever has to be darkened.
///
/// The veil used to be a materialised second copy of the virtual screen with
/// every byte scaled down — ~33 MB of DIB on a 4K desktop, more across several
/// monitors, plus a full ~33 M-byte pass over it on the main thread before the
/// selector even appeared. (A 256-entry lookup table had already taken the
/// multiply and the divide out of that pass; the copy itself is what is gone
/// now.) `AlphaBlend` does the same arithmetic inside GDI, straight into the
/// back buffer and only over the pixels a paint actually touches, so the
/// dimmed image never exists.
///
/// `CreateDIBSection` hands back zeroed memory, which is already the black this
/// wants; the fill is written out anyway because the colour IS the veil, not an
/// accident of the allocator.
fn veil_source(reference: HDC) -> Result<Canvas, String> {
    let mut veil = Canvas::create(reference, VEIL_SOURCE_SIDE_PX, VEIL_SOURCE_SIDE_PX)?;
    veil.pixels_mut().fill(VEIL_SOURCE_CHANNEL);
    Ok(veil)
}

#[derive(Clone, Copy, PartialEq)]
enum Outcome {
    Active,
    Confirmed,
    Cancelled,
}

struct Overlay {
    original: HDC,
    veil: HDC,
    back: HDC,
    width: i32,
    height: i32,
    anchor: POINT,
    pointer: POINT,
    dragging: bool,
    started: bool,
    outcome: Outcome,
}

impl Overlay {
    fn new(original: &Canvas, veil: &Canvas, back: &Canvas, bounds: &VirtualScreen) -> Self {
        Self {
            original: original.dc,
            veil: veil.dc,
            back: back.dc,
            width: bounds.width,
            height: bounds.height,
            anchor: POINT::default(),
            pointer: POINT::default(),
            dragging: false,
            started: false,
            outcome: Outcome::Active,
        }
    }

    fn selection(&self) -> Option<RECT> {
        if !self.started {
            return None;
        }
        let area = normalized_rect(self.anchor, self.pointer);
        non_empty(area)
    }

    fn accepted(&self) -> Option<RECT> {
        self.selection().filter(|area| {
            area.right - area.left >= MIN_SELECTION_PX && area.bottom - area.top >= MIN_SELECTION_PX
        })
    }

    fn inside(&self, point: POINT) -> POINT {
        POINT {
            x: point.x.clamp(0, self.width),
            y: point.y.clamp(0, self.height),
        }
    }

    fn begin(&mut self, point: POINT) {
        let point = self.inside(point);
        self.anchor = point;
        self.pointer = point;
        self.started = true;
        self.dragging = true;
    }

    fn drag(&mut self, point: POINT) {
        self.pointer = self.inside(point);
    }

    fn finish(&mut self, point: POINT) {
        self.drag(point);
        self.dragging = false;
        self.outcome = match self.accepted() {
            Some(_) => Outcome::Confirmed,
            None => Outcome::Cancelled,
        };
    }

    fn cancel(&mut self) {
        self.outcome = Outcome::Cancelled;
    }
}

fn normalized_rect(anchor: POINT, pointer: POINT) -> RECT {
    RECT {
        left: anchor.x.min(pointer.x),
        top: anchor.y.min(pointer.y),
        right: anchor.x.max(pointer.x),
        bottom: anchor.y.max(pointer.y),
    }
}

fn non_empty(area: RECT) -> Option<RECT> {
    (area.right > area.left && area.bottom > area.top).then_some(area)
}

fn inflated(area: RECT, amount: i32) -> RECT {
    RECT {
        left: area.left - amount,
        top: area.top - amount,
        right: area.right + amount,
        bottom: area.bottom + amount,
    }
}

fn union_of(first: RECT, second: RECT) -> RECT {
    RECT {
        left: first.left.min(second.left),
        top: first.top.min(second.top),
        right: first.right.max(second.right),
        bottom: first.bottom.max(second.bottom),
    }
}

fn intersection(first: RECT, second: RECT) -> Option<RECT> {
    non_empty(RECT {
        left: first.left.max(second.left),
        top: first.top.max(second.top),
        right: first.right.min(second.right),
        bottom: first.bottom.min(second.bottom),
    })
}

fn dirty_area(previous: Option<RECT>, current: Option<RECT>) -> Option<RECT> {
    let previous = previous.map(|area| inflated(area, FRAME_THICKNESS_PX));
    let current = current.map(|area| inflated(area, FRAME_THICKNESS_PX));
    match (previous, current) {
        (Some(before), Some(after)) => Some(union_of(before, after)),
        (Some(before), None) => Some(before),
        (None, Some(after)) => Some(after),
        (None, None) => None,
    }
}

fn pointer_position(lparam: LPARAM) -> POINT {
    let packed = lparam.0 as u32;
    POINT {
        x: (packed & COORDINATE_MASK) as u16 as i16 as i32,
        y: ((packed >> COORDINATE_SHIFT) & COORDINATE_MASK) as u16 as i16 as i32,
    }
}

fn request_redraw(window: HWND, area: Option<RECT>) {
    let Some(area) = area else {
        return;
    };
    unsafe {
        let _ = InvalidateRect(Some(window), Some(&area), REDRAW_WITHOUT_ERASE);
    }
}

fn register_overlay_class() -> u16 {
    let Ok(instance) = (unsafe { GetModuleHandleW(None) }) else {
        return UNREGISTERED_CLASS_ATOM;
    };
    let Ok(cursor) = (unsafe { LoadCursorW(None, IDC_CROSS) }) else {
        return UNREGISTERED_CLASS_ATOM;
    };
    let class = WNDCLASSW {
        lpfnWndProc: Some(overlay_proc),
        hInstance: instance.into(),
        hCursor: cursor,
        lpszClassName: OVERLAY_CLASS_NAME,
        ..Default::default()
    };
    unsafe { RegisterClassW(&class) }
}

fn ensure_overlay_class() -> Result<(), String> {
    static OVERLAY_CLASS_ATOM: OnceLock<u16> = OnceLock::new();
    let atom = OVERLAY_CLASS_ATOM.get_or_init(register_overlay_class);
    if *atom == UNREGISTERED_CLASS_ATOM {
        return Err(CLASS_FAILED.to_string());
    }
    Ok(())
}

struct OverlayWindow(HWND);

impl OverlayWindow {
    fn open(bounds: &VirtualScreen, state: *mut Overlay) -> Result<Self, String> {
        ensure_overlay_class()?;
        let instance = unsafe { GetModuleHandleW(None) }.map_err(|_| WINDOW_FAILED.to_string())?;
        let window = unsafe {
            CreateWindowExW(
                WS_EX_TOPMOST | WS_EX_TOOLWINDOW,
                OVERLAY_CLASS_NAME,
                OVERLAY_WINDOW_TITLE,
                WS_POPUP,
                bounds.origin.x,
                bounds.origin.y,
                bounds.width,
                bounds.height,
                None,
                None,
                Some(instance.into()),
                Some(state.cast()),
            )
        }
        .map_err(|_| WINDOW_FAILED.to_string())?;
        Ok(Self(window))
    }

    fn present(&self) {
        unsafe {
            let _ = ShowWindow(self.0, SW_SHOW);
            let _ = SetForegroundWindow(self.0);
            let _ = SetFocus(Some(self.0));
        }
    }
}

impl Drop for OverlayWindow {
    fn drop(&mut self) {
        unsafe {
            let _ = DestroyWindow(self.0);
        }
    }
}

fn run_overlay(
    original: &Canvas,
    veil: &Canvas,
    back: &Canvas,
    bounds: &VirtualScreen,
) -> Result<Option<RECT>, String> {
    let mut state = Overlay::new(original, veil, back, bounds);
    let handle: *mut Overlay = &mut state;
    let window = OverlayWindow::open(bounds, handle)?;
    window.present();
    pump_messages(handle);
    drop(window);
    match state.outcome {
        Outcome::Confirmed => Ok(state.accepted()),
        Outcome::Active | Outcome::Cancelled => Ok(None),
    }
}

fn pump_messages(state: *mut Overlay) {
    let mut message = MSG::default();
    loop {
        if unsafe { (*state).outcome } != Outcome::Active {
            return;
        }
        let received =
            unsafe { GetMessageW(&mut message, None, NO_MESSAGE_FILTER, NO_MESSAGE_FILTER) };
        if received.0 <= MESSAGE_LOOP_END {
            return;
        }
        unsafe {
            let _ = TranslateMessage(&message);
            DispatchMessageW(&message);
        }
    }
}

unsafe fn attach_overlay_state(window: HWND, lparam: LPARAM) {
    let creation = lparam.0 as *const CREATESTRUCTW;
    if creation.is_null() {
        return;
    }
    let state = unsafe { (*creation).lpCreateParams };
    unsafe {
        SetWindowLongPtrW(window, GWLP_USERDATA, state as isize);
    }
}

unsafe fn overlay_state<'a>(window: HWND) -> Option<&'a mut Overlay> {
    let raw = unsafe { GetWindowLongPtrW(window, GWLP_USERDATA) } as *mut Overlay;
    unsafe { raw.as_mut() }
}

unsafe extern "system" fn overlay_proc(
    window: HWND,
    message: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    if message == WM_NCCREATE {
        unsafe { attach_overlay_state(window, lparam) };
        return unsafe { DefWindowProcW(window, message, wparam, lparam) };
    }
    let Some(state) = (unsafe { overlay_state(window) }) else {
        return unsafe { DefWindowProcW(window, message, wparam, lparam) };
    };
    match message {
        WM_ERASEBKGND => LRESULT(ERASE_HANDLED),
        WM_PAINT => {
            unsafe { paint_overlay(window, state) };
            LRESULT(MESSAGE_HANDLED)
        }
        WM_LBUTTONDOWN => {
            let previous = state.selection();
            state.begin(pointer_position(lparam));
            request_redraw(window, dirty_area(previous, state.selection()));
            LRESULT(MESSAGE_HANDLED)
        }
        WM_MOUSEMOVE => {
            if state.dragging {
                let previous = state.selection();
                state.drag(pointer_position(lparam));
                request_redraw(window, dirty_area(previous, state.selection()));
            }
            LRESULT(MESSAGE_HANDLED)
        }
        WM_LBUTTONUP => {
            state.finish(pointer_position(lparam));
            LRESULT(MESSAGE_HANDLED)
        }
        WM_RBUTTONDOWN => {
            state.cancel();
            LRESULT(MESSAGE_HANDLED)
        }
        WM_KEYDOWN if wparam.0 == usize::from(VK_ESCAPE.0) => {
            state.cancel();
            LRESULT(MESSAGE_HANDLED)
        }
        _ => unsafe { DefWindowProcW(window, message, wparam, lparam) },
    }
}

unsafe fn paint_overlay(window: HWND, state: &Overlay) {
    let mut paint = PAINTSTRUCT::default();
    let target = unsafe { BeginPaint(window, &mut paint) };
    if !target.is_invalid() {
        unsafe {
            compose_overlay(state, paint.rcPaint);
            blit(target, state.back, paint.rcPaint);
        }
    }
    unsafe {
        let _ = EndPaint(window, &paint);
    }
}

/// `clip` with `hole` cut out of it: the strip above the hole, the strip below
/// it, and the two beside it. Veiling these rather than the whole clip is what
/// keeps the selected area from being painted twice on every mouse move — once
/// darkened and once restored from the original, which is what the composite
/// had to do while the veil was a whole second image to blit from.
fn clip_around(clip: RECT, hole: Option<RECT>) -> [Option<RECT>; VEIL_PARTS] {
    let Some(hole) = hole else {
        return [Some(clip), None, None, None];
    };
    [
        non_empty(RECT { bottom: hole.top, ..clip }),
        non_empty(RECT { top: hole.bottom, ..clip }),
        non_empty(RECT { right: hole.left, top: hole.top, bottom: hole.bottom, ..clip }),
        non_empty(RECT { left: hole.right, top: hole.top, bottom: hole.bottom, ..clip }),
    ]
}

unsafe fn compose_overlay(state: &Overlay, clip: RECT) {
    let Some(clip) = non_empty(clip) else {
        return;
    };
    // The true screen first, then the veil everywhere the selection does not
    // stand. The selection is left exactly as captured, so nothing has to be
    // repainted over a darkened copy of itself.
    unsafe { blit(state.back, state.original, clip) };
    let selection = state.selection();
    let hole = selection.and_then(|area| intersection(area, clip));
    for part in clip_around(clip, hole).into_iter().flatten() {
        unsafe { draw_veil(state.back, state.veil, part) };
    }
    let Some(selection) = selection else {
        return;
    };
    unsafe { draw_selection_frame(state.back, selection) };
}

/// The single veil pixel, stretched across `area`. GDI reads the source once
/// and blends it per destination pixel — no intermediate image of any size.
unsafe fn draw_veil(target: HDC, veil: HDC, area: RECT) {
    unsafe {
        let _ = AlphaBlend(
            target,
            area.left,
            area.top,
            area.right - area.left,
            area.bottom - area.top,
            veil,
            VEIL_SOURCE_ORIGIN,
            VEIL_SOURCE_ORIGIN,
            VEIL_SOURCE_SIDE_PX,
            VEIL_SOURCE_SIDE_PX,
            veil_blend(),
        );
    }
}

unsafe fn blit(target: HDC, source: HDC, area: RECT) {
    unsafe {
        let _ = BitBlt(
            target,
            area.left,
            area.top,
            area.right - area.left,
            area.bottom - area.top,
            Some(source),
            area.left,
            area.top,
            SRCCOPY,
        );
    }
}

unsafe fn draw_selection_frame(target: HDC, selection: RECT) {
    let brush = unsafe { CreateSolidBrush(FRAME_COLOR) };
    if brush.is_invalid() {
        return;
    }
    for ring in FIRST_FRAME_RING..=FRAME_THICKNESS_PX {
        let outline = inflated(selection, ring);
        unsafe { FrameRect(target, &outline, brush) };
    }
    unsafe {
        let _ = DeleteObject(brush.into());
    }
}

/// BGRA rows out of the screen copy, RGB rows in. One allocation and a straight
/// row-by-row write: pushing three channels at a time meant ~25 M capacity
/// checks for a full-screen selection, and this still runs on the main thread.
fn crop_to_rgb(source: &Canvas, area: RECT) -> RgbImage {
    let width = (area.right - area.left) as usize;
    let height = (area.bottom - area.top) as usize;
    let stride = source.width as usize * SOURCE_CHANNELS;
    let pixels = source.pixels();
    let row_len = width * resample::CHANNELS;
    let mut rgb = vec![0u8; row_len * height];
    for row in 0..height {
        let start = (area.top as usize + row) * stride + area.left as usize * SOURCE_CHANNELS;
        let line = &pixels[start..start + width * SOURCE_CHANNELS];
        let (samples, _) = line.as_chunks::<SOURCE_CHANNELS>();
        let target = &mut rgb[row * row_len..(row + 1) * row_len];
        for (sample, out) in samples
            .iter()
            .zip(target.chunks_exact_mut(resample::CHANNELS))
        {
            out[OUTPUT_RED_INDEX] = sample[CHANNEL_RED];
            out[OUTPUT_GREEN_INDEX] = sample[CHANNEL_GREEN];
            out[OUTPUT_BLUE_INDEX] = sample[CHANNEL_BLUE];
        }
    }
    RgbImage {
        pixels: rgb,
        width,
        height,
    }
}

fn encode_png(capture: RgbImage) -> Result<Vec<u8>, String> {
    let image = resample::cap_long_edge(capture, resample::MAX_LONG_EDGE_PX);
    let mut png = Vec::new();
    let mut encoder = Encoder::new(&mut png, image.width as u32, image.height as u32);
    encoder.set_color(ColorType::Rgb);
    encoder.set_depth(BitDepth::Eight);
    // The crate's default is level-6 deflate, which on a full-screen selection
    // is the single most expensive thing in the whole shot. The PNG lives just
    // long enough to be base64'd into an event, so the few per cent of size the
    // slow levels buy are paid for in latency and thrown away.
    encoder.set_compression(Compression::Fast);
    let mut writer = encoder
        .write_header()
        .map_err(|_| PNG_ENCODE_FAILED.to_string())?;
    writer
        .write_image_data(&image.pixels)
        .map_err(|_| PNG_ENCODE_FAILED.to_string())?;
    writer.finish().map_err(|_| PNG_ENCODE_FAILED.to_string())?;
    Ok(png)
}

pub struct Backend;

impl super::ScreenshotBackend for Backend {
    /// The cropped rows themselves: the overlay's GDI objects are already gone
    /// by the time this crosses back to the caller, so nothing about the
    /// capture's lifecycle keeps the encode on the main thread.
    type Capture = RgbImage;

    fn capture_region() -> Result<Option<Self::Capture>, String> {
        capture_region()
    }

    fn encode_png(capture: Self::Capture) -> Result<Vec<u8>, String> {
        encode_png(capture)
    }
}
