use super::*;
use std::sync::{Arc, Condvar, Mutex};

#[test]
fn a_poisoned_mutex_stays_usable() {
    let lock = Arc::new(Mutex::new(7u32));
    let poisoner = Arc::clone(&lock);
    let _ = std::thread::spawn(move || {
        let _guard = poisoner.lock().unwrap();
        panic!("отравляем мьютекс");
    })
    .join();
    assert!(lock.lock().is_err(), "мьютекс действительно отравлен");
    assert_eq!(*lock.lock_safe(), 7, "значение доступно после паники");
    *lock.lock_safe() = 9;
    assert_eq!(*lock.lock_safe(), 9);
}

#[test]
fn a_poisoned_condvar_wait_still_returns_the_guard() {
    let pair = Arc::new((Mutex::new(false), Condvar::new()));
    let poisoner = Arc::clone(&pair);
    let _ = std::thread::spawn(move || {
        let _guard = poisoner.0.lock().unwrap();
        panic!("отравляем мьютекс под condvar");
    })
    .join();
    let (guard, timeout) = pair
        .1
        .wait_timeout_safe(pair.0.lock_safe(), Duration::from_millis(1));
    assert!(timeout.timed_out());
    assert!(!*guard);
}
