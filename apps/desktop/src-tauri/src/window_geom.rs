pub fn clamp_window_x(x: i32, width: u32, monitor_x: i32, monitor_width: u32) -> i32 {
    let max_x = monitor_x + monitor_width as i32 - width as i32;
    x.min(max_x).max(monitor_x)
}

#[cfg(test)]
mod tests;
