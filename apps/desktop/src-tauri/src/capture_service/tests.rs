use super::*;
use CaptureMode::*;

const HOLDERS: [CaptureMode; 3] = [Ptt, AutoListening, AudioCheck];

#[test]
fn a_fresh_service_is_idle_and_holds_nothing() {
    let svc = CaptureService::default();
    assert_eq!(svc.mode(), Idle);
    assert!(svc.is_idle());
    assert!(!svc.is_present());
}

/// The transition table the four scattered `if auto::is_active(app)` checks
/// used to be. One holder at a time; releasing is always allowed.
#[test]
fn only_one_consumer_may_hold_the_capture() {
    for holder in HOLDERS {
        for challenger in HOLDERS {
            assert!(
                !holder.can_enter(challenger),
                "{holder:?} → {challenger:?}: занятый захват не отдают"
            );
        }
        assert!(Idle.can_enter(holder), "из Idle можно занять {holder:?}");
        assert!(holder.can_enter(Idle), "освободить можно всегда");
    }
}

#[test]
fn claiming_a_busy_capture_names_the_holder() {
    for holder in HOLDERS {
        let svc = CaptureService::default();
        svc.claim(holder).unwrap();
        for challenger in HOLDERS {
            let err = svc.claim(challenger).unwrap_err();
            assert_eq!(err.message, holder.busy_error().message, "{holder:?}");
        }
        assert_eq!(svc.mode(), holder, "отказ не меняет владельца");
    }
}

/// A second audio check while one is already running has to be refused — that
/// is the case the RAII slot exists for, and "re-claiming your own mode is
/// free" would have let two five-second checks share one device.
#[test]
fn re_claiming_a_mode_you_already_hold_is_refused() {
    let svc = CaptureService::default();
    svc.claim(AudioCheck).unwrap();
    assert!(svc.claim(AudioCheck).is_err());
    assert_eq!(svc.mode(), AudioCheck);
}

#[test]
fn release_frees_the_capture_for_the_next_consumer() {
    let svc = CaptureService::default();
    svc.claim(Ptt).unwrap();
    svc.release(Ptt);
    assert!(svc.is_idle());
    svc.claim(AudioCheck).unwrap();
    assert!(svc.is_in(AudioCheck));
}

/// A late release from a finished job must not take the capture away from
/// whoever claimed it afterwards.
#[test]
fn releasing_a_mode_you_no_longer_hold_does_nothing() {
    let svc = CaptureService::default();
    svc.claim(Ptt).unwrap();
    svc.release(Ptt);
    svc.claim(AutoListening).unwrap();
    svc.release(Ptt);
    assert_eq!(svc.mode(), AutoListening, "чужой release не сбрасывает режим");
}

#[test]
fn stopping_with_no_capture_is_none_not_a_failure() {
    let svc = CaptureService::default();
    assert!(svc.stop_taken().is_none());
}

#[test]
fn accessors_answer_none_while_there_is_no_capture() {
    let svc = CaptureService::default();
    assert!(svc.with(|_| ()).is_none());
    assert!(svc.with_mut(|_| ()).is_none());
}

#[test]
fn the_idle_busy_error_is_still_a_sentence() {
    assert!(!Idle.busy_error().message.is_empty());
}
