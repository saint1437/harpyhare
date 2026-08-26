use std::ffi::{c_char, CStr};

const CAPTURE_OK: i32 = 0;
const CAPTURE_CANCELLED: i32 = 1;
const ERROR_BUFFER_LEN: usize = 256;
const EMPTY_CAPTURE_MESSAGE: &str = "Снимок пустой";

extern "C" {
    fn harpy_capture_region(
        out_png: *mut *mut u8,
        out_len: *mut usize,
        err: *mut c_char,
        err_len: usize,
    ) -> i32;
    fn harpy_capture_region_free(png: *mut u8);
}

pub fn capture_region() -> Result<Option<Vec<u8>>, String> {
    let mut png: *mut u8 = std::ptr::null_mut();
    let mut len: usize = 0;
    let mut err = [0 as c_char; ERROR_BUFFER_LEN];
    let code = unsafe { harpy_capture_region(&mut png, &mut len, err.as_mut_ptr(), err.len()) };
    match code {
        CAPTURE_OK => {
            if png.is_null() || len == 0 {
                return Err(EMPTY_CAPTURE_MESSAGE.to_string());
            }
            let bytes = unsafe { std::slice::from_raw_parts(png, len) }.to_vec();
            unsafe { harpy_capture_region_free(png) };
            Ok(Some(bytes))
        }
        CAPTURE_CANCELLED => Ok(None),
        _ => Err(unsafe { CStr::from_ptr(err.as_ptr()) }
            .to_string_lossy()
            .into_owned()),
    }
}

pub struct Backend;

impl super::ScreenshotBackend for Backend {
    fn capture_region() -> Result<Option<Vec<u8>>, String> {
        capture_region()
    }
}
