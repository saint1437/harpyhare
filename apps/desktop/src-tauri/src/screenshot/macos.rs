use std::ffi::{c_char, c_void, CStr};

use super::resample::MAX_LONG_EDGE_PX;

const CAPTURE_OK: i32 = 0;
const CAPTURE_CANCELLED: i32 = 1;
const ERROR_BUFFER_LEN: usize = 256;
const EMPTY_CAPTURE_MESSAGE: &str = "Снимок пустой";

extern "C" {
    fn harpy_capture_region(
        max_long_edge_px: usize,
        out_image: *mut *mut c_void,
        err: *mut c_char,
        err_len: usize,
    ) -> i32;
    fn harpy_encode_capture(
        image: *mut c_void,
        out_png: *mut *mut u8,
        out_len: *mut usize,
        err: *mut c_char,
        err_len: usize,
    ) -> i32;
    fn harpy_capture_release(image: *mut c_void);
    fn harpy_capture_region_free(png: *mut u8);
}

/// The selected region, cut out and already capped, waiting to become a PNG.
///
/// It holds a retained `CGImageRef`. Handing it to another thread is sound: a
/// CGImage is immutable once created and ImageIO's encoder touches no AppKit
/// state — the "main thread only" rule of this backend covers the overlay, not
/// the encode. Ownership is the point of the type: whichever way `encode_png`
/// ends, `Drop` releases the image exactly once.
pub struct CapturedImage(*mut c_void);

// SAFETY: see the doc comment — the pointee is an immutable CoreGraphics image
// and nothing else holds a reference to it once `harpy_capture_region` returns.
unsafe impl Send for CapturedImage {}

impl Drop for CapturedImage {
    fn drop(&mut self) {
        unsafe { harpy_capture_release(self.0) };
    }
}

fn message_from(err: &[c_char]) -> String {
    unsafe { CStr::from_ptr(err.as_ptr()) }
        .to_string_lossy()
        .into_owned()
}

pub fn capture_region() -> Result<Option<CapturedImage>, String> {
    let mut image: *mut c_void = std::ptr::null_mut();
    let mut err = [0 as c_char; ERROR_BUFFER_LEN];
    let code = unsafe {
        harpy_capture_region(
            MAX_LONG_EDGE_PX,
            &mut image,
            err.as_mut_ptr(),
            err.len(),
        )
    };
    match code {
        CAPTURE_OK => {
            if image.is_null() {
                return Err(EMPTY_CAPTURE_MESSAGE.to_string());
            }
            Ok(Some(CapturedImage(image)))
        }
        CAPTURE_CANCELLED => Ok(None),
        _ => Err(message_from(&err)),
    }
}

pub fn encode_png(capture: CapturedImage) -> Result<Vec<u8>, String> {
    let mut png: *mut u8 = std::ptr::null_mut();
    let mut len: usize = 0;
    let mut err = [0 as c_char; ERROR_BUFFER_LEN];
    let code = unsafe {
        harpy_encode_capture(capture.0, &mut png, &mut len, err.as_mut_ptr(), err.len())
    };
    if code != CAPTURE_OK {
        return Err(message_from(&err));
    }
    if png.is_null() || len == 0 {
        return Err(EMPTY_CAPTURE_MESSAGE.to_string());
    }
    let bytes = unsafe { std::slice::from_raw_parts(png, len) }.to_vec();
    unsafe { harpy_capture_region_free(png) };
    Ok(bytes)
}

pub struct Backend;

impl super::ScreenshotBackend for Backend {
    /// macOS keeps its PNG encoder on the C side: `region_capture.c` goes
    /// through ImageIO, and there is no PNG encoder on the Rust side of a macOS
    /// build (`png` is a Windows-only dependency). The resolution cap therefore
    /// also happens there — the C is handed `resample::MAX_LONG_EDGE_PX` rather
    /// than a second copy of the number.
    type Capture = CapturedImage;

    fn capture_region() -> Result<Option<Self::Capture>, String> {
        capture_region()
    }

    fn encode_png(capture: Self::Capture) -> Result<Vec<u8>, String> {
        encode_png(capture)
    }
}
