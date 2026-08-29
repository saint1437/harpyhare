//! One long-lived animator thread for every window tween.
//!
//! Every `set_window_size` used to `std::thread::spawn` an OS thread that slept
//! 14 times for 13 ms and exited; expanding the orb spawned a second one just to
//! sleep before restoring `min_inner_size`; and `platform::handle_arrow_key`
//! spawned an async task per keypress. Hold "resize + arrow" with key repeat on
//! and that is dozens of threads a second, all racing to set the size of one
//! window.
//!
//! Now there is one thread with a queue. A new request replaces whatever is
//! being animated — the old tween simply stops existing rather than being
//! detected as superseded a frame later — and the deferred minimum-size restore
//! is a deadline in the same loop instead of a thread of its own.

use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::OnceLock;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager, WebviewWindow};

use crate::app_state::App;

const ANIMATOR_THREAD_NAME: &str = "window-animator";

pub const RESIZE_TWEEN_STEPS: u32 = 14;
pub const RESIZE_TWEEN_FRAME_INTERVAL: Duration = Duration::from_millis(13);
pub const RESIZE_EPSILON_LOGICAL_PX: f64 = 1.0;

/// The tween lasts `RESIZE_TWEEN_STEPS` frames and the minimum size comes back
/// only after it — otherwise the window snaps to its minimum before it has
/// finished growing. The delay is derived from the frame interval on purpose:
/// retune the tween and the delay follows instead of silently stopping covering
/// it.
pub const MIN_SIZE_RESTORE_DELAY: Duration = Duration::from_millis(
    (RESIZE_TWEEN_STEPS as u64 + 4) * RESIZE_TWEEN_FRAME_INTERVAL.as_millis() as u64,
);

#[derive(Debug, Clone, Copy)]
pub struct ResizeTween {
    pub from_width: f64,
    pub to_width: f64,
    pub from_height: f64,
    pub to_height: f64,
    pub from_x: i32,
    pub to_x: i32,
    pub y: i32,
}

enum Job {
    Resize {
        app: AppHandle,
        window: WebviewWindow,
        tween: ResizeTween,
        generation: u64,
    },
    RestoreMinSize {
        app: AppHandle,
        window: WebviewWindow,
        width: f64,
        height: f64,
        generation: u64,
    },
}

struct ActiveTween {
    app: AppHandle,
    window: WebviewWindow,
    tween: ResizeTween,
    generation: u64,
    step: u32,
    applied: Option<(f64, f64)>,
    applied_device: Option<DeviceFrame>,
    next_frame: Instant,
}

/// The frame as the compositor will see it. Two eased steps that round to the
/// same device pixels are the same frame, and the ease-out's last steps do
/// exactly that: they differ by well under a physical pixel.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct DeviceFrame {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

fn device_frame(x: i32, y: i32, width: f64, height: f64, scale: f64) -> DeviceFrame {
    DeviceFrame {
        x,
        y,
        width: (width * scale).round() as u32,
        height: (height * scale).round() as u32,
    }
}

struct PendingRestore {
    app: AppHandle,
    window: WebviewWindow,
    width: f64,
    height: f64,
    generation: u64,
    due: Instant,
}

static ANIMATOR: OnceLock<Sender<Job>> = OnceLock::new();

fn animator() -> &'static Sender<Job> {
    ANIMATOR.get_or_init(|| {
        let (tx, rx) = mpsc::channel();
        // A failed spawn is not fatal: without the animator the window simply
        // stops animating, which beats taking the process down over a tween.
        if let Err(e) = std::thread::Builder::new()
            .name(ANIMATOR_THREAD_NAME.into())
            .spawn(move || run(rx))
        {
            eprintln!("не удалось запустить поток анимации окна: {e}");
        }
        tx
    })
}

fn submit(job: Job) {
    if animator().send(job).is_err() {
        eprintln!("поток анимации окна недоступен — размер применяется без анимации");
    }
}

pub fn start_resize(app: AppHandle, window: WebviewWindow, tween: ResizeTween, generation: u64) {
    submit(Job::Resize {
        app,
        window,
        tween,
        generation,
    });
}

pub fn restore_min_size_after_tween(
    app: AppHandle,
    window: WebviewWindow,
    width: f64,
    height: f64,
    generation: u64,
) {
    submit(Job::RestoreMinSize {
        app,
        window,
        width,
        height,
        generation,
    });
}

fn run(rx: Receiver<Job>) {
    let mut current: Option<ActiveTween> = None;
    let mut restore: Option<PendingRestore> = None;
    loop {
        let deadline = next_deadline(current.as_ref(), restore.as_ref());
        let received = match deadline {
            None => rx.recv().map_err(|_| RecvTimeoutError::Disconnected),
            Some(at) => rx.recv_timeout(at.saturating_duration_since(Instant::now())),
        };
        match received {
            Ok(job) => accept(job, &mut current, &mut restore),
            Err(RecvTimeoutError::Disconnected) => return,
            Err(RecvTimeoutError::Timeout) => {}
        }
        run_due_restore(&mut restore);
        advance(&mut current);
    }
}

fn next_deadline(current: Option<&ActiveTween>, restore: Option<&PendingRestore>) -> Option<Instant> {
    deadline_of(current.map(|t| t.next_frame), restore.map(|r| r.due))
}

fn deadline_of(frame: Option<Instant>, restore: Option<Instant>) -> Option<Instant> {
    match (frame, restore) {
        (Some(frame), Some(due)) => Some(frame.min(due)),
        (frame, due) => frame.or(due),
    }
}

/// A new request wins outright. The old tween is dropped rather than left to
/// discover next frame that it has been superseded — that discovery cost a
/// frame of the new animation and, on a fast double tap, snapped the minimum
/// size back in the middle of someone else's tween.
fn accept(job: Job, current: &mut Option<ActiveTween>, restore: &mut Option<PendingRestore>) {
    match job {
        Job::Resize {
            app,
            window,
            tween,
            generation,
        } => {
            *current = Some(ActiveTween {
                app,
                window,
                tween,
                generation,
                step: 0,
                applied: None,
                applied_device: None,
                next_frame: Instant::now(),
            });
        }
        Job::RestoreMinSize {
            app,
            window,
            width,
            height,
            generation,
        } => {
            *restore = Some(PendingRestore {
                app,
                window,
                width,
                height,
                generation,
                due: Instant::now() + MIN_SIZE_RESTORE_DELAY,
            });
        }
    }
}

fn run_due_restore(restore: &mut Option<PendingRestore>) {
    let Some(pending) = restore.as_ref() else {
        return;
    };
    if pending.due > Instant::now() {
        return;
    }
    // A generation, not a re-read of the collapsed flag: a quick double tap of
    // the hotkey leaves a restore whose `set_collapsed` is no longer the latest.
    if pending.app.state::<App>().window.collapse_generation() == pending.generation {
        let _ = pending
            .window
            .set_min_size(Some(tauri::LogicalSize::new(pending.width, pending.height)));
    }
    *restore = None;
}

fn advance(current: &mut Option<ActiveTween>) {
    let Some(active) = current.as_mut() else {
        return;
    };
    if active.next_frame > Instant::now() {
        return;
    }
    // Read once and reuse: the scale decides both whether the tween is still
    // ours and whether the next step is worth applying, and it used to be
    // fetched from the animator thread twice over per frame.
    let scale = active.window.scale_factor().unwrap_or(1.0);
    if superseded(active, scale) {
        *current = None;
        return;
    }
    active.step += 1;
    let last = active.step >= RESIZE_TWEEN_STEPS;
    let eased = ease_out_cubic(f64::from(active.step) / f64::from(RESIZE_TWEEN_STEPS));
    let t = &active.tween;
    let (width, height, x) = if last {
        (t.to_width, t.to_height, t.to_x)
    } else {
        (
            t.from_width + (t.to_width - t.from_width) * eased,
            t.from_height + (t.to_height - t.from_height) * eased,
            (f64::from(t.from_x) + f64::from(t.to_x - t.from_x) * eased).round() as i32,
        )
    };
    // The tail of an ease-out lands on the same device pixels several steps
    // running. Applying such a step wakes the main event loop, clones the
    // window and makes the webview relay out for a change nobody can see.
    let device = device_frame(x, t.y, width, height, scale);
    if active.applied_device != Some(device) {
        apply_window_frame(&active.app, &active.window, x, t.y, width, height);
        active.applied_device = Some(device);
    }
    if last {
        *current = None;
        return;
    }
    active.applied = Some((width, height));
    active.next_frame = Instant::now() + RESIZE_TWEEN_FRAME_INTERVAL;
}

fn superseded(active: &ActiveTween, scale: f64) -> bool {
    if active.app.state::<App>().window.resize_generation() != active.generation {
        return true;
    }
    // The user grabbed an edge mid-tween: the last frame we applied is no longer
    // the window's size, so the animation is no longer describing reality.
    active
        .applied
        .is_some_and(|(width, height)| !frame_still_ours(&active.window, scale, width, height))
}

pub fn ease_out_cubic(t: f64) -> f64 {
    1.0 - (1.0 - t).powi(3)
}

fn frame_still_ours(w: &WebviewWindow, scale: f64, width: f64, height: f64) -> bool {
    let Ok(size) = w.inner_size() else {
        return true;
    };
    (f64::from(size.width) / scale - width).abs() < RESIZE_EPSILON_LOGICAL_PX
        && (f64::from(size.height) / scale - height).abs() < RESIZE_EPSILON_LOGICAL_PX
}

fn apply_window_frame(app: &AppHandle, w: &WebviewWindow, x: i32, y: i32, width: f64, height: f64) {
    let win = w.clone();
    let _ = app.run_on_main_thread(move || {
        if win.outer_position().is_ok_and(|p| p.x != x || p.y != y) {
            let _ = win.set_position(tauri::PhysicalPosition::new(x, y));
        }
        let _ = win.set_size(tauri::LogicalSize::new(width, height));
    });
}

#[cfg(test)]
mod tests;
