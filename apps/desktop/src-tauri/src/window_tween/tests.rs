use super::*;

#[test]
fn easing_runs_from_zero_to_one_without_overshoot() {
    assert!((ease_out_cubic(0.0) - 0.0).abs() < f64::EPSILON);
    assert!((ease_out_cubic(1.0) - 1.0).abs() < f64::EPSILON);
    let mut previous = 0.0;
    for step in 1..=RESIZE_TWEEN_STEPS {
        let value = ease_out_cubic(f64::from(step) / f64::from(RESIZE_TWEEN_STEPS));
        assert!(value > previous, "монотонность на шаге {step}");
        assert!(value <= 1.0);
        previous = value;
    }
}

/// The restore must outlast the animation it is waiting for, and that
/// relationship is what the derived constant exists to keep true.
#[test]
fn the_min_size_restore_outlasts_the_tween() {
    let animation = RESIZE_TWEEN_FRAME_INTERVAL * RESIZE_TWEEN_STEPS;
    assert!(MIN_SIZE_RESTORE_DELAY > animation);
}

#[test]
fn the_earliest_of_the_two_deadlines_wins() {
    let now = Instant::now();
    let soon = now + Duration::from_millis(5);
    let later = now + Duration::from_millis(50);
    assert_eq!(deadline_of(Some(soon), Some(later)), Some(soon));
    assert_eq!(deadline_of(Some(later), Some(soon)), Some(soon));
    assert_eq!(deadline_of(Some(soon), None), Some(soon));
    assert_eq!(deadline_of(None, Some(later)), Some(later));
    assert_eq!(deadline_of(None, None), None);
}
