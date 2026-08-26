//! Windows: an explicit DACL on the files that hold the secrets.
//!
//! `settings.json` carries the Anthropic key, the Groq key and the paid access
//! token. On unix the file is created `0600` and that is the end of it; on
//! Windows there are no POSIX modes, so the file used to take whatever the
//! profile folder handed down. That default is user-only today, but it is
//! *inherited*, not stated — widen the folder (a redirected or roaming profile,
//! a support script, a restored backup) and every inherited ACE widens with it,
//! silently.
//!
//! So the file gets a DACL of its own: exactly one ACE — full control for the
//! SID of this process's token user — and `PROTECTED_DACL_SECURITY_INFORMATION`,
//! which stops anything being inherited on top of it. Administrators and SYSTEM
//! are deliberately NOT added: they can take ownership anyway, and naming them
//! in the ACL would only make the intent ("this file is the user's") less clear.
//!
//! The DACL is applied to the temporary file, before the content is written and
//! before the rename: a `rename` within a volume moves the file record, ACL and
//! all, so the final file is protected from the first byte on. None of this can
//! be verified on macOS — the `#[cfg(windows)]` test below runs on Windows only.

use std::io;
use std::os::windows::ffi::OsStrExt;
use std::path::Path;

use windows::core::{PCWSTR, PWSTR};
use windows::Win32::Foundation::{CloseHandle, LocalFree, HANDLE, HLOCAL};
use windows::Win32::Security::Authorization::{
    SetEntriesInAclW, SetNamedSecurityInfoW, EXPLICIT_ACCESS_W, NO_MULTIPLE_TRUSTEE, SET_ACCESS,
    SE_FILE_OBJECT, TRUSTEE_IS_SID, TRUSTEE_IS_USER, TRUSTEE_W,
};
use windows::Win32::Security::{
    GetTokenInformation, TokenUser, ACL, DACL_SECURITY_INFORMATION, NO_INHERITANCE,
    PROTECTED_DACL_SECURITY_INFORMATION, PSID, TOKEN_QUERY, TOKEN_USER,
};
use windows::Win32::Storage::FileSystem::FILE_ALL_ACCESS;
use windows::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};

fn io_error(call: &str, e: windows::core::Error) -> io::Error {
    io::Error::other(format!("{call}: {e}"))
}

/// The raw `GetTokenInformation(TokenUser)` buffer, kept whole on purpose:
/// `TOKEN_USER.User.Sid` points INTO it, so the SID is only valid while this
/// value is alive.
struct TokenUserBuffer(Vec<u8>);

impl TokenUserBuffer {
    fn current_process() -> io::Result<Self> {
        // SAFETY: the token handle is opened, read and closed here; the buffer
        // is sized by the API itself in the first (deliberately failing) call.
        unsafe {
            let mut token = HANDLE::default();
            OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token)
                .map_err(|e| io_error("OpenProcessToken", e))?;
            let mut needed = 0u32;
            // Expected to fail with ERROR_INSUFFICIENT_BUFFER: that IS the way
            // to ask how big the answer is.
            let _ = GetTokenInformation(token, TokenUser, None, 0, &mut needed);
            let mut buffer = vec![0u8; needed as usize];
            let read = GetTokenInformation(
                token,
                TokenUser,
                Some(buffer.as_mut_ptr().cast()),
                needed,
                &mut needed,
            );
            let _ = CloseHandle(token);
            read.map_err(|e| io_error("GetTokenInformation", e))?;
            Ok(Self(buffer))
        }
    }

    fn sid(&self) -> PSID {
        // SAFETY: the buffer was filled by GetTokenInformation(TokenUser), so
        // it starts with a TOKEN_USER.
        unsafe { (*self.0.as_ptr().cast::<TOKEN_USER>()).User.Sid }
    }
}

fn wide_path(path: &Path) -> Vec<u16> {
    path.as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}

/// Replaces the file's DACL with a single full-control ACE for the current
/// user, and marks it protected so nothing is inherited on top.
pub(super) fn restrict_to_current_user(path: &Path) -> io::Result<()> {
    let token = TokenUserBuffer::current_process()?;
    let entry = EXPLICIT_ACCESS_W {
        // The specific file rights, not GENERIC_ALL: a generic mask in an ACE
        // relies on the object's generic mapping being applied for it, and
        // being explicit removes the question entirely.
        grfAccessPermissions: FILE_ALL_ACCESS.0,
        grfAccessMode: SET_ACCESS,
        grfInheritance: NO_INHERITANCE,
        Trustee: TRUSTEE_W {
            pMultipleTrustee: std::ptr::null_mut(),
            MultipleTrusteeOperation: NO_MULTIPLE_TRUSTEE,
            TrusteeForm: TRUSTEE_IS_SID,
            TrusteeType: TRUSTEE_IS_USER,
            ptstrName: PWSTR(token.sid().0.cast()),
        },
    };

    let mut acl: *mut ACL = std::ptr::null_mut();
    // SAFETY: one entry, no old ACL to merge into, and `acl` is a fresh out
    // pointer the call fills with a LocalAlloc'd ACL we free below.
    unsafe { SetEntriesInAclW(Some(&[entry]), None, &mut acl) }
        .ok()
        .map_err(|e| io_error("SetEntriesInAclW", e))?;

    let wide = wide_path(path);
    // SAFETY: `wide` is NUL-terminated and outlives the call; `acl` is the ACL
    // built above.
    let applied = unsafe {
        SetNamedSecurityInfoW(
            PCWSTR(wide.as_ptr()),
            SE_FILE_OBJECT,
            DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION,
            None,
            None,
            Some(acl),
            None,
        )
    };
    // SAFETY: `acl` came from SetEntriesInAclW, which allocates with LocalAlloc.
    unsafe {
        let _ = LocalFree(Some(HLOCAL(acl.cast())));
    }
    applied
        .ok()
        .map_err(|e| io_error("SetNamedSecurityInfoW", e))
}

#[cfg(test)]
mod tests;
