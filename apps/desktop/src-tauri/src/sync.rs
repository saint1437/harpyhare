//! Poison-tolerant locking.
//!
//! A panic while a `Mutex` is held poisons it forever, and `lock().unwrap()`
//! turns that into a panic at every later call. In this app the mutexes guard
//! *domains* (capture session, chat stream slots, settings), so one panic in the
//! capture consumer thread used to kill push-to-talk, auto listening, the audio
//! check and `set_settings` — the window stayed up and the product was dead.
//!
//! Poisoning tells us nothing we act on: none of the guarded values has an
//! invariant a half-finished mutation would break beyond repair (they are
//! plain data — a settings struct, an `Option<AudioCapture>`, a `String`
//! buffer), and there is no recovery path a caller could take other than
//! carrying on. So we recover the guard instead of propagating the panic.
//!
//! `parking_lot` would remove poisoning by construction, but `capture.rs`
//! depends on `std::sync::Condvar::wait_timeout` semantics and has no test
//! coverage at all; swapping the primitive there is a behavioural risk with no
//! way to verify it here, whereas `PoisonError::into_inner` is the same lock
//! with the panic branch removed.

use std::sync::{Condvar, MutexGuard, PoisonError, WaitTimeoutResult};
use std::time::Duration;

pub trait MutexExt<'a, T: ?Sized + 'a> {
    /// `lock()` that keeps working after a panic in another thread.
    fn lock_safe(&'a self) -> MutexGuard<'a, T>;
}

impl<'a, T: ?Sized + 'a> MutexExt<'a, T> for std::sync::Mutex<T> {
    fn lock_safe(&'a self) -> MutexGuard<'a, T> {
        self.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

pub trait CondvarExt {
    fn wait_safe<'a, T>(&self, guard: MutexGuard<'a, T>) -> MutexGuard<'a, T>;
    fn wait_timeout_safe<'a, T>(
        &self,
        guard: MutexGuard<'a, T>,
        timeout: Duration,
    ) -> (MutexGuard<'a, T>, WaitTimeoutResult);
}

impl CondvarExt for Condvar {
    fn wait_safe<'a, T>(&self, guard: MutexGuard<'a, T>) -> MutexGuard<'a, T> {
        self.wait(guard).unwrap_or_else(PoisonError::into_inner)
    }

    fn wait_timeout_safe<'a, T>(
        &self,
        guard: MutexGuard<'a, T>,
        timeout: Duration,
    ) -> (MutexGuard<'a, T>, WaitTimeoutResult) {
        self.wait_timeout(guard, timeout)
            .unwrap_or_else(PoisonError::into_inner)
    }
}

#[cfg(test)]
mod tests;
