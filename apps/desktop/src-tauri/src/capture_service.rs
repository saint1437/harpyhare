//! The single owner of the system-audio capture and of who is allowed to hold
//! it.
//!
//! Four consumers shared one `Mutex<Option<AudioCapture>>` and each carried its
//! own idea of when it was allowed to touch it, spelled `if auto::is_active(app)`
//! in four different files (`recording.rs`, `preferences.rs`, `audio_check.rs`,
//! `auto.rs`) plus a fifth check in `permissions.rs`. Adding a fifth consumer
//! meant finding all of them; forgetting one meant two features driving the same
//! device with no error anywhere.
//!
//! Here the question is asked once, of an explicit `CaptureMode`, and the
//! transitions are a table rather than a scattering of conditions.
//!
//! The second thing this fixes is the lock: `AudioCapture::stop()` waits on a
//! condvar for up to five seconds for the consumer thread to finish, and it used
//! to do that **while holding the capture lock** — so a stop stalled everyone
//! else, `permissions_status` included. `stop_taken` takes the capture out from
//! under the lock, stops it outside, and puts it back; the mode is what keeps
//! anyone else from rebuilding into the empty slot in the meantime.

use std::sync::Mutex;

use crate::capture::{CaptureDevice, CaptureError};
use crate::error::{AppError, ErrorCode};
use crate::sync::MutexExt;

const ERR_PTT_BUSY: &str = "Идёт запись по клавише — дождитесь её окончания";
const ERR_AUTO_ACTIVE: &str = "Включено автослушание — выключите его для записи по клавише";
const ERR_CHECK_RUNNING: &str = "Идёт проверка звука — дождитесь её окончания";

/// Who is driving the capture right now. Exactly one of them may.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum CaptureMode {
    #[default]
    Idle,
    /// A push-to-talk recording, from the key going down to the transcript.
    Ptt,
    /// Auto mode: the capture stays in buffering mode with a segmenter armed.
    AutoListening,
    /// The launcher's five-second "is sound arriving" check.
    AudioCheck,
}

impl CaptureMode {
    /// The whole mutual-exclusion policy, in one place: releasing is always
    /// allowed, claiming only from `Idle`.
    ///
    /// Re-claiming a mode you already hold is deliberately a CONFLICT, not a
    /// no-op — a second audio check while one is running has to be refused, and
    /// the callers that are idempotent (auto mode's start) dedupe before they
    /// get here, on their own flag.
    pub fn can_enter(self, next: CaptureMode) -> bool {
        matches!(next, CaptureMode::Idle) || matches!(self, CaptureMode::Idle)
    }

    /// What to tell the user when this mode is the one in the way. The wording
    /// names the holder, because "busy" without a subject is what sent people
    /// looking in the wrong settings screen.
    pub fn busy_error(self) -> AppError {
        use crate::error::subject;
        let (message, subject) = match self {
            CaptureMode::Idle | CaptureMode::Ptt => (ERR_PTT_BUSY, subject::PTT_BUSY),
            CaptureMode::AutoListening => (ERR_AUTO_ACTIVE, subject::AUTO_ACTIVE),
            CaptureMode::AudioCheck => (ERR_CHECK_RUNNING, subject::CHECK_RUNNING),
        };
        AppError::with_subject(ErrorCode::Internal, message, subject)
    }
}

#[derive(Default)]
pub struct CaptureService {
    capture: Mutex<Option<Box<dyn CaptureDevice>>>,
    mode: Mutex<CaptureMode>,
}

impl CaptureService {
    pub fn mode(&self) -> CaptureMode {
        *self.mode.lock_safe()
    }

    pub fn is_idle(&self) -> bool {
        self.mode() == CaptureMode::Idle
    }

    pub fn is_in(&self, mode: CaptureMode) -> bool {
        self.mode() == mode
    }

    /// Takes the capture for `next`, or says who is holding it.
    pub fn claim(&self, next: CaptureMode) -> Result<(), AppError> {
        let mut mode = self.mode.lock_safe();
        if !mode.can_enter(next) {
            return Err(mode.busy_error());
        }
        *mode = next;
        Ok(())
    }

    /// Gives the capture back. Releasing a mode that is no longer the current
    /// one is deliberately a no-op: a late `finish_transcription` must not clear
    /// a mode somebody else has since claimed.
    pub fn release(&self, from: CaptureMode) {
        let mut mode = self.mode.lock_safe();
        if *mode == from {
            *mode = CaptureMode::Idle;
        }
    }

    pub fn is_present(&self) -> bool {
        self.capture.lock_safe().is_some()
    }

    pub fn install(&self, capture: Option<Box<dyn CaptureDevice>>) {
        *self.capture.lock_safe() = capture;
    }

    pub fn with<R>(&self, f: impl FnOnce(&dyn CaptureDevice) -> R) -> Option<R> {
        let guard = self.capture.lock_safe();
        guard.as_deref().map(f)
    }

    // The `'static` on the trait object is not decoration: `&mut dyn Trait` is
    // invariant in the object's lifetime, so without it the borrow checker
    // refuses to shorten `&mut (dyn CaptureDevice + 'static)` out of the box.
    pub fn with_mut<R>(&self, f: impl FnOnce(&mut (dyn CaptureDevice + 'static)) -> R) -> Option<R> {
        let mut guard = self.capture.lock_safe();
        guard.as_deref_mut().map(f)
    }

    /// `None` = there is no capture at all, which is a different story and a
    /// different policy from a capture that is alive as an object and dead as a
    /// stream (see `AudioCapture::is_stalled`).
    pub fn is_stalled(&self) -> Option<bool> {
        self.with(|c| c.is_stalled())
    }

    /// How long the current recording has been running. No capture = no
    /// recording, so zero rather than an `Option` the FSM would have to unwrap.
    pub fn recording_secs(&self) -> f32 {
        self.with(|c| c.recording_secs()).unwrap_or(0.0)
    }

    /// Starts a session, or says there was nothing to start it on.
    pub fn start(&self, sink: Option<crate::capture::ChunkSink>) -> Option<Result<(), CaptureError>> {
        self.with_mut(|c| c.start(sink))
    }

    /// Stops the recording WITHOUT holding the lock across the wait.
    ///
    /// `AudioCapture::stop()` blocks on a condvar until the consumer thread has
    /// drained the ring — up to five seconds on the timeout path. Holding the
    /// lock through that froze every other reader of the capture. The capture is
    /// therefore taken out, stopped, and put back; `None` means there was no
    /// capture to stop.
    pub fn stop_taken(&self) -> Option<Result<Vec<f32>, CaptureError>> {
        let mut taken = self.capture.lock_safe().take()?;
        let result = taken.stop();
        // Put it back only if nobody installed a replacement while it was out
        // (a device rebuild can land here); the newer object wins.
        let mut slot = self.capture.lock_safe();
        if slot.is_none() {
            *slot = Some(taken);
        }
        Some(result)
    }
}

#[cfg(test)]
mod tests;
