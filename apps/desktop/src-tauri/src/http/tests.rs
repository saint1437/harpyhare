use super::*;
use std::sync::atomic::{AtomicU32, Ordering};

#[derive(Debug, PartialEq)]
struct TestError {
    retryable: bool,
}

impl Retryable for TestError {
    fn should_retry(&self) -> bool {
        self.retryable
    }
}

const FAST: RetryPolicy = RetryPolicy::new(4, Duration::from_millis(1), Duration::from_millis(4));

#[tokio::test]
async fn a_success_on_the_first_attempt_does_not_retry() {
    let calls = AtomicU32::new(0);
    let out: Result<u32, TestError> = retry_with_backoff(FAST, |_| {
        calls.fetch_add(1, Ordering::SeqCst);
        async { Ok(7) }
    })
    .await;
    assert_eq!(out.unwrap(), 7);
    assert_eq!(calls.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn a_retryable_failure_is_attempted_up_to_the_policy_limit() {
    let calls = AtomicU32::new(0);
    let out: Result<u32, TestError> = retry_with_backoff(FAST, |_| {
        calls.fetch_add(1, Ordering::SeqCst);
        async { Err(TestError { retryable: true }) }
    })
    .await;
    assert!(out.is_err());
    assert_eq!(calls.load(Ordering::SeqCst), FAST.attempts);
}

#[tokio::test]
async fn a_non_retryable_failure_stops_immediately() {
    let calls = AtomicU32::new(0);
    let out: Result<u32, TestError> = retry_with_backoff(FAST, |_| {
        calls.fetch_add(1, Ordering::SeqCst);
        async { Err(TestError { retryable: false }) }
    })
    .await;
    assert!(out.is_err());
    assert_eq!(calls.load(Ordering::SeqCst), 1, "неповторяемая ошибка не повторяется");
}

#[tokio::test]
async fn a_later_attempt_can_still_succeed() {
    let calls = AtomicU32::new(0);
    let out: Result<u32, TestError> = retry_with_backoff(FAST, |attempt| {
        calls.fetch_add(1, Ordering::SeqCst);
        async move {
            if attempt < 2 {
                Err(TestError { retryable: true })
            } else {
                Ok(attempt)
            }
        }
    })
    .await;
    assert_eq!(out.unwrap(), 2);
    assert_eq!(calls.load(Ordering::SeqCst), 3);
}

#[test]
fn the_delay_grows_and_is_capped_and_never_zero() {
    let policy = RetryPolicy::new(6, Duration::from_millis(100), Duration::from_millis(800));
    for attempt in 0..6 {
        let delay = backoff_delay(policy, attempt);
        assert!(delay >= Duration::from_millis(50), "джиттер не убирает паузу целиком");
        assert!(delay <= policy.max_delay, "пауза не превышает потолок");
    }
    // Half the window is fixed, so the floor really does double until the cap.
    assert!(backoff_delay(policy, 3) >= backoff_delay(policy, 0));
}
