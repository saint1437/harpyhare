//! Геометрия окна HTML-превью. Чистая математика, всё в физических пикселях
//! (вызывающий код переводит логические размеры через scale_factor монитора).

/// Прямоугольник окна превью над HUD: x/ширина наследуются от main-окна,
/// y = верх HUD − зазор − высота, с клампом по верхней границе монитора
/// (если места над HUD мало, превью прижимается к верху и может перекрыть HUD).
/// Спека упоминала monitor_size — для клампа по верху он не нужен (YAGNI).
pub fn preview_rect(
    main_pos: (i32, i32),
    main_size: (u32, u32),
    monitor_pos: (i32, i32),
    preview_h: u32,
    gap: u32,
) -> (i32, i32, u32, u32) {
    let x = main_pos.0;
    let w = main_size.0;
    let y = (main_pos.1 - gap as i32 - preview_h as i32).max(monitor_pos.1);
    (x, y, w, preview_h)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sits_above_hud_with_gap() {
        let (x, y, w, h) = preview_rect((100, 800), (760, 290), (0, 0), 480, 12);
        assert_eq!((x, w, h), (100, 760, 480));
        assert_eq!(y, 800 - 12 - 480);
    }

    #[test]
    fn clamps_to_monitor_top_when_no_room() {
        let (_, y, _, _) = preview_rect((100, 200), (760, 290), (0, 0), 480, 12);
        assert_eq!(y, 0);
    }

    #[test]
    fn clamp_respects_negative_monitor_origin() {
        // монитор выше/левее основного: origin отрицательный
        let (_, y, _, _) = preview_rect((-1000, -300), (760, 290), (-1920, -500), 480, 12);
        assert_eq!(y, -500); // -300-12-480 = -792 < -500 → кламп
    }
}
