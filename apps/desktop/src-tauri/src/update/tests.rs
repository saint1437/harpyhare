use super::*;

#[test]
fn notify_unless_version_skipped() {
    assert!(should_notify("0.2.0", ""));
    assert!(should_notify("0.2.0", "0.1.5"));
    assert!(!should_notify("0.2.0", "0.2.0"));
}

#[test]
fn progress_steps_on_whole_percent() {
    let total = Some(1000u64);
    assert_eq!(progress_step(4, total, 0), None);
    assert_eq!(progress_step(10, total, 0), Some(1));
    assert_eq!(progress_step(19, total, 1), None);
    assert_eq!(progress_step(1000, total, 99), Some(100));
}

#[test]
fn progress_steps_per_mib_without_total() {
    const MIB: u64 = BYTES_PER_MIB;
    assert_eq!(progress_step(MIB - 1, None, 0), None);
    assert_eq!(progress_step(MIB, None, 0), Some(1));
    assert_eq!(progress_step(MIB + 5, None, 1), None);
    assert_eq!(progress_step(3 * MIB, None, 1), Some(3));
    assert_eq!(progress_step(2 * MIB, Some(0), 1), Some(2));
}
