//! Геометрия размеров главного окна. Чистая математика в физических пикселях.

/// Новый x главного окна, чтобы окно ширины `width` целиком влезло на монитор
/// `[monitor_x, monitor_x + monitor_width)`: при упоре в правый край — сдвиг влево,
/// но не левее левого края монитора.
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
        // правый край 1600+760=2360 > 1920; max_x = 1920-760 = 1160
        assert_eq!(clamp_window_x(1600, 760, 0, 1920), 1160);
    }

    #[test]
    fn clamps_to_left_when_wider_than_monitor() {
        // width 2000 > 1920 → max_x = -80 < 0 → .max(0) = 0
        assert_eq!(clamp_window_x(50, 2000, 0, 1920), 0);
    }

    #[test]
    fn respects_negative_monitor_origin() {
        // монитор слева: origin -1920, width 1920 → правый край 0; max_x = 0-760 = -760
        assert_eq!(clamp_window_x(-100, 760, -1920, 1920), -760);
    }
}
