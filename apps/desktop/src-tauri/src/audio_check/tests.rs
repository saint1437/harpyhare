use super::*;

#[test]
fn peak_of_silence_is_zero() {
    assert_eq!(peak_level(&[0.0, 0.0, 0.0]), 0.0);
    assert_eq!(peak_level(&[]), 0.0);
}

#[test]
fn peak_takes_the_loudest_sample_by_absolute_value() {
    assert_eq!(peak_level(&[0.1, -0.7, 0.3]), 0.7);
}

#[test]
fn peak_never_leaves_the_unit_scale() {
    // Индикатор уровня рисуется как доля от единицы; клиппинг за её пределами
    // растянул бы шкалу на весь экран.
    assert_eq!(peak_level(&[3.5, -9.0]), 1.0);
}
