//! The HUD's geometry and its folded/unfolded state, decided without a window.
//!
//! `window.rs` reached into four fields of `App` (`resize_gen`,
//! `window_collapsed`, `collapse_gen`, `preview_html`) from inside functions
//! that all needed a live `WebviewWindow`, so none of the decisions could be
//! tested: whether a resize is worth animating at all, where the window has to
//! move so a wider frame does not hang off the monitor, and the ORDER of the
//! steps that fold the HUD into the orb and back — which is where the bugs were
//! (the minimum size has to come down *before* the tween, or the orb simply
//! never shrinks).
//!
//! Here those decisions are pure; applying them is a port (`WindowSurface`)
//! that `window.rs` implements over the real window.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;

use crate::events::{self, EventBus};
use crate::sync::MutexExt;
use crate::window_geom;
use crate::window_tween::{ResizeTween, RESIZE_EPSILON_LOGICAL_PX};

/// The window as the resize planner needs to know it: logical size, physical
/// position, and the scale that ties the two together.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct WindowFrame {
    pub width: f64,
    pub height: f64,
    pub x: i32,
    pub y: i32,
    pub scale: f64,
}

/// The monitor the window is on, in physical pixels. `None` = the window could
/// not name one, and then the target width is treated as the whole screen.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Monitor {
    pub x: i32,
    pub width: u32,
}

/// The sizes the fold/unfold works between. Passed in rather than read here:
/// two of the four come from `Settings` and one from `settings::limits`.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CollapseLayout {
    /// The side of the square orb window.
    pub orb: f64,
    pub expanded_width: f64,
    pub expanded_height: f64,
    pub min_width: f64,
    pub min_height: f64,
}

/// Applying a plan. Everything here is a call on a real window, and every one of
/// them is a no-op the domain has no opinion about.
pub trait WindowSurface {
    fn set_min_size(&self, width: f64, height: f64);
    fn resize_to(&self, width: f64, height: f64);
    /// Unfolding shows the window; `focus` says whether it also takes the
    /// keyboard away from whatever the user is looking at.
    fn show_and_focus(&self, focus: bool);
    /// Puts the real minimum back once the tween has had time to finish.
    fn restore_min_size_after_tween(&self, width: f64, height: f64, generation: u64);
}

/// Owns the resize generation, the folded flag with its own generation, and the
/// HTML the `preview://` scheme serves.
#[derive(Default)]
pub struct WindowService {
    /// Свёрнут ли HUD в клубок. Живёт в Rust, потому что глобальный хоткей
    /// сворачивания обрабатывается здесь же, а окно меняет только Rust.
    collapsed: AtomicBool,
    /// Collapse generation: the deferred min_inner_size restore after an
    /// expand must stay silent when its set_collapsed is no longer the latest.
    collapse_gen: AtomicU64,
    resize_gen: AtomicU64,
    preview_html: Mutex<String>,
}

impl WindowService {
    pub fn is_collapsed(&self) -> bool {
        self.collapsed.load(Ordering::SeqCst)
    }

    pub fn resize_generation(&self) -> u64 {
        self.resize_gen.load(Ordering::SeqCst)
    }

    pub fn collapse_generation(&self) -> u64 {
        self.collapse_gen.load(Ordering::SeqCst)
    }

    pub fn preview_html(&self) -> String {
        self.preview_html.lock_safe().clone()
    }

    pub fn set_preview_html(&self, html: String) {
        *self.preview_html.lock_safe() = html;
    }

    /// The tween a resize needs, and the generation that identifies it.
    ///
    /// `None` = the window is already that size to within a logical pixel;
    /// animating it would be a frame of jitter and a generation bump that
    /// cancels somebody else's tween for nothing.
    pub fn plan_resize(
        &self,
        from: WindowFrame,
        to_width: f64,
        to_height: f64,
        monitor: Option<Monitor>,
    ) -> Option<(ResizeTween, u64)> {
        if (from.width - to_width).abs() < RESIZE_EPSILON_LOGICAL_PX
            && (from.height - to_height).abs() < RESIZE_EPSILON_LOGICAL_PX
        {
            return None;
        }
        let target_phys_width = (to_width * from.scale).round() as u32;
        let (monitor_x, monitor_width) = monitor
            .map(|m| (m.x, m.width))
            .unwrap_or((from.x, target_phys_width));
        let tween = ResizeTween {
            from_width: from.width,
            to_width,
            from_height: from.height,
            to_height,
            from_x: from.x,
            to_x: window_geom::clamp_window_x(from.x, target_phys_width, monitor_x, monitor_width),
            y: from.y,
        };
        Some((tween, self.resize_gen.fetch_add(1, Ordering::SeqCst) + 1))
    }

    /// Folds the HUD into the orb, or unfolds it. Returns whether anything
    /// changed — asking for the state it is already in is a no-op, and that is
    /// what keeps a repeated hotkey from bumping the generation.
    ///
    /// Разворот — это не только «стать больше». Хоткей сворачивания глобальный,
    /// и разворачивают окно чаще всего из ЧУЖОГО приложения: без set_focus окно
    /// вырастает, но ключевым не становится, и набранное уходит мимо. Каретку в
    /// поле ставит эффект на фронтенде — событие focus-prompt здесь пришло бы
    /// раньше, чем композер успел смонтироваться. Но клавиатурный фокус забирает
    /// только РУЧНОЙ разворот: окно и так alwaysOnTop, а отнимать клавиатуру у
    /// чужого приложения без просьбы — ровно то, из-за чего готовая расшифровка
    /// намеренно не поднимает окно (см. deliver_transcript).
    pub fn set_collapsed<B: EventBus>(
        &self,
        bus: &B,
        surface: &impl WindowSurface,
        collapsed: bool,
        focus: bool,
        layout: CollapseLayout,
    ) -> bool {
        if self.collapsed.swap(collapsed, Ordering::SeqCst) == collapsed {
            return false;
        }
        let generation = self.collapse_gen.fetch_add(1, Ordering::SeqCst) + 1;
        events::collapsed_changed(bus, collapsed);
        if collapsed {
            // Минимум надо опустить ДО твина: окно физически не может стать
            // меньше своего min_inner_size, и без этого клубок не сожмётся.
            surface.set_min_size(layout.orb, layout.orb);
            surface.resize_to(layout.orb, layout.orb);
        } else {
            surface.show_and_focus(focus);
            surface.resize_to(layout.expanded_width, layout.expanded_height);
            surface.restore_min_size_after_tween(
                layout.min_width,
                layout.min_height,
                generation,
            );
        }
        true
    }
}

#[cfg(test)]
mod tests;
