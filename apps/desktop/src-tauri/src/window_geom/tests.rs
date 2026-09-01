use super::*;

#[test]
fn keeps_x_when_window_fits() {
    assert_eq!(clamp_window_x(100, 760, 0, 1920), 100);
}

#[test]
fn shifts_left_when_overflowing_right_edge() {
    assert_eq!(clamp_window_x(1600, 760, 0, 1920), 1160);
}

#[test]
fn clamps_to_left_when_wider_than_monitor() {
    assert_eq!(clamp_window_x(50, 2000, 0, 1920), 0);
}

#[test]
fn respects_negative_monitor_origin() {
    assert_eq!(clamp_window_x(-100, 760, -1920, 1920), -760);
}

#[test]
fn target_outer_width_keeps_the_invisible_windows_frame() {
    assert_eq!(target_outer_width(960, 960, 976), 976);
}

#[test]
fn target_outer_width_does_not_underflow_when_outer_is_smaller() {
    assert_eq!(target_outer_width(960, 976, 960), 960);
}
