pub fn clamp_window_x(x: i32, width: u32, monitor_x: i32, monitor_width: u32) -> i32 {
    let max_x = monitor_x + monitor_width as i32 - width as i32;
    x.min(max_x).max(monitor_x)
}

pub fn clamp_window_size(
    width: f64,
    height: f64,
    available_width: f64,
    available_height: f64,
) -> (f64, f64) {
    (width.min(available_width), height.min(available_height))
}

#[cfg(test)]
mod tests;
