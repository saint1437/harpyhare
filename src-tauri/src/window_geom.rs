pub fn clamp_window_x(x: i32, width: u32, monitor_x: i32, monitor_width: u32) -> i32 {
    let max_x = monitor_x + monitor_width as i32 - width as i32;
    x.min(max_x).max(monitor_x)
}

#[cfg(test)]
mod tests {
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
}
