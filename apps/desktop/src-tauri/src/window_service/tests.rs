use super::*;

use crate::events::RecordedEvents;

const ORB: f64 = 80.0;

fn layout() -> CollapseLayout {
    CollapseLayout {
        orb: ORB,
        expanded_width: 960.0,
        expanded_height: 680.0,
        min_width: 520.0,
        min_height: 420.0,
    }
}

fn frame(width: f64, height: f64, x: i32) -> WindowFrame {
    WindowFrame {
        width,
        height,
        x,
        y: 100,
        scale: 1.0,
    }
}

/// Records the calls in order — the order IS the invariant this port exists to
/// protect.
#[derive(Debug, PartialEq)]
enum Call {
    MinSize(f64, f64),
    Resize(f64, f64),
    ShowAndFocus(bool),
    RestoreMinSize(f64, f64, u64),
}

#[derive(Default)]
struct FakeSurface(Mutex<Vec<Call>>);

impl FakeSurface {
    fn calls(&self) -> Vec<String> {
        self.0.lock_safe().iter().map(|c| format!("{c:?}")).collect()
    }

    fn push(&self, call: Call) {
        self.0.lock_safe().push(call);
    }
}

impl WindowSurface for FakeSurface {
    fn set_min_size(&self, width: f64, height: f64) {
        self.push(Call::MinSize(width, height));
    }

    fn resize_to(&self, width: f64, height: f64) {
        self.push(Call::Resize(width, height));
    }

    fn show_and_focus(&self, focus: bool) {
        self.push(Call::ShowAndFocus(focus));
    }

    fn restore_min_size_after_tween(&self, width: f64, height: f64, generation: u64) {
        self.push(Call::RestoreMinSize(width, height, generation));
    }
}

// --- resize planning ---------------------------------------------------------

/// A resize of less than a logical pixel is not worth a tween — and, more to
/// the point, not worth a generation bump, which would cancel a live animation.
#[test]
fn a_resize_that_changes_nothing_is_not_planned() {
    let svc = WindowService::default();
    assert!(svc
        .plan_resize(frame(960.0, 680.0, 0), 960.0, 680.4, None)
        .is_none());
    assert_eq!(svc.resize_generation(), 0);
}

#[test]
fn a_real_resize_is_planned_and_numbered() {
    let svc = WindowService::default();
    let (tween, generation) = svc
        .plan_resize(frame(960.0, 680.0, 0), 1200.0, 680.0, None)
        .unwrap();

    assert_eq!(tween.from_width, 960.0);
    assert_eq!(tween.to_width, 1200.0);
    assert_eq!(tween.from_height, 680.0);
    assert_eq!(tween.to_height, 680.0);
    assert_eq!(tween.y, 100);
    assert_eq!(generation, 1);
    assert_eq!(svc.resize_generation(), 1);
}

/// Height alone is enough: the two dimensions are checked together, not one at
/// a time, or a pure vertical growth would be skipped.
#[test]
fn a_change_in_height_alone_is_still_a_resize() {
    let svc = WindowService::default();
    assert!(svc
        .plan_resize(frame(960.0, 680.0, 0), 960.0, 900.0, None)
        .is_some());
}

/// A window growing near the right edge would hang off the screen, so it slides
/// left by exactly as much as it has to.
#[test]
fn a_window_growing_at_the_right_edge_slides_back_onto_the_monitor() {
    let svc = WindowService::default();
    let monitor = Some(Monitor { x: 0, width: 1440 });
    let (tween, _) = svc
        .plan_resize(frame(400.0, 680.0, 1200), 400.0, 900.0, monitor)
        .unwrap();
    assert_eq!(tween.from_x, 1200);
    assert_eq!(tween.to_x, 1040, "1440 − 400 — правый край монитора");
}

#[test]
fn a_window_that_still_fits_does_not_move() {
    let svc = WindowService::default();
    let monitor = Some(Monitor { x: 0, width: 1440 });
    let (tween, _) = svc
        .plan_resize(frame(400.0, 680.0, 100), 600.0, 680.0, monitor)
        .unwrap();
    assert_eq!(tween.to_x, 100);
}

/// The target width is in logical pixels and the monitor in physical ones, so
/// the anchoring has to go through the scale factor — on a Retina display a
/// missing `* scale` puts the window half a screen off.
#[test]
fn the_anchor_accounts_for_the_display_scale() {
    let svc = WindowService::default();
    let monitor = Some(Monitor { x: 0, width: 2880 });
    let retina = WindowFrame {
        width: 400.0,
        height: 680.0,
        x: 2400,
        y: 0,
        scale: 2.0,
    };
    let (tween, _) = svc.plan_resize(retina, 800.0, 680.0, monitor).unwrap();
    assert_eq!(tween.to_x, 1280, "2880 − 800×2");
}

/// No monitor to ask means no clamping to invent: the window stays where it is.
#[test]
fn without_a_monitor_the_window_keeps_its_position() {
    let svc = WindowService::default();
    let (tween, _) = svc
        .plan_resize(frame(400.0, 680.0, 640), 900.0, 680.0, None)
        .unwrap();
    assert_eq!(tween.to_x, 640);
}

// --- folding into the orb and back ------------------------------------------

/// The minimum size must come DOWN before the tween: a window cannot go below
/// its `min_inner_size`, so the wrong order means the orb never shrinks.
#[test]
fn folding_lowers_the_minimum_before_it_shrinks_the_window() {
    let svc = WindowService::default();
    let bus = RecordedEvents::default();
    let surface = FakeSurface::default();

    assert!(svc.set_collapsed(&bus, &surface, true, true, layout()));
    assert_eq!(
        surface.calls(),
        vec![
            format!("{:?}", Call::MinSize(ORB, ORB)),
            format!("{:?}", Call::Resize(ORB, ORB)),
        ]
    );
    assert!(svc.is_collapsed());
    assert_eq!(bus.names(), vec!["collapsed-changed"]);
    assert_eq!(
        bus.payload("collapsed-changed").unwrap(),
        serde_json::json!({ "collapsed": true })
    );
}

#[test]
fn unfolding_shows_the_window_grows_it_and_puts_the_minimum_back() {
    let svc = WindowService::default();
    let bus = RecordedEvents::default();
    let surface = FakeSurface::default();
    svc.set_collapsed(&bus, &surface, true, false, layout());

    let surface = FakeSurface::default();
    assert!(svc.set_collapsed(&bus, &surface, false, true, layout()));
    assert_eq!(
        surface.calls(),
        vec![
            format!("{:?}", Call::ShowAndFocus(true)),
            format!("{:?}", Call::Resize(960.0, 680.0)),
            format!("{:?}", Call::RestoreMinSize(520.0, 420.0, 2)),
        ]
    );
    assert!(!svc.is_collapsed());
}

/// Only a MANUAL unfold takes the keyboard. The window is always-on-top, so an
/// automatic one is already visible, and stealing focus from another app
/// unasked is exactly what a finished transcript deliberately does not do.
#[test]
fn an_automatic_unfold_does_not_steal_the_keyboard() {
    let svc = WindowService::default();
    let bus = RecordedEvents::default();
    svc.set_collapsed(&bus, &FakeSurface::default(), true, false, layout());

    let surface = FakeSurface::default();
    svc.set_collapsed(&bus, &surface, false, false, layout());
    assert!(surface.calls().contains(&format!("{:?}", Call::ShowAndFocus(false))));
}

#[test]
fn folding_a_window_that_is_already_folded_does_nothing() {
    let svc = WindowService::default();
    let bus = RecordedEvents::default();
    svc.set_collapsed(&bus, &FakeSurface::default(), true, true, layout());

    let surface = FakeSurface::default();
    assert!(!svc.set_collapsed(&bus, &surface, true, true, layout()));
    assert!(surface.calls().is_empty());
    assert_eq!(bus.names().len(), 1, "повтор не шлёт второе событие");
    assert_eq!(svc.collapse_generation(), 1, "и не тратит поколение");
}

/// A double tap of the hotkey leaves a deferred minimum-size restore whose
/// `set_collapsed` is no longer the latest — the generation is what the
/// animator checks before applying it.
#[test]
fn every_fold_gets_its_own_generation() {
    let svc = WindowService::default();
    let bus = RecordedEvents::default();
    let surface = FakeSurface::default();

    svc.set_collapsed(&bus, &surface, true, true, layout());
    assert_eq!(svc.collapse_generation(), 1);
    svc.set_collapsed(&bus, &surface, false, true, layout());
    assert_eq!(svc.collapse_generation(), 2);
    svc.set_collapsed(&bus, &surface, true, true, layout());
    svc.set_collapsed(&bus, &surface, false, true, layout());
    assert_eq!(svc.collapse_generation(), 4);
    assert!(surface
        .calls()
        .contains(&format!("{:?}", Call::RestoreMinSize(520.0, 420.0, 4))));
}

#[test]
fn the_preview_html_is_whatever_was_last_set() {
    let svc = WindowService::default();
    assert_eq!(svc.preview_html(), "");
    svc.set_preview_html("<b>привет</b>".into());
    assert_eq!(svc.preview_html(), "<b>привет</b>");
}
