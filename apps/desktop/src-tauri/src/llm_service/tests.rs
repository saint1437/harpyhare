use super::*;

const CHAT: &str = "chat-1";

fn slots() -> LlmStreamSlots {
    LlmStreamSlots::new()
}

#[test]
fn a_new_stream_cancels_the_one_it_replaces() {
    let mut s = slots();
    let first = CancellationToken::new();
    claim_slot(&mut s, CHAT, 1, first.clone());
    assert!(!first.is_cancelled());

    claim_slot(&mut s, CHAT, 2, CancellationToken::new());
    assert!(first.is_cancelled(), "barge-in must cancel the answer it supersedes");
}

#[test]
fn only_the_live_stream_is_current() {
    let mut s = slots();
    claim_slot(&mut s, CHAT, 1, CancellationToken::new());
    claim_slot(&mut s, CHAT, 2, CancellationToken::new());
    assert!(!slot_is_current(&s, CHAT, 1), "superseded stream must not emit");
    assert!(slot_is_current(&s, CHAT, 2));
}

#[test]
fn a_superseded_stream_cannot_release_the_slot_of_the_one_that_replaced_it() {
    let mut s = slots();
    let live = CancellationToken::new();
    claim_slot(&mut s, CHAT, 1, CancellationToken::new());
    claim_slot(&mut s, CHAT, 2, live.clone());

    release_slot(&mut s, CHAT, 1);
    assert!(
        slot_is_current(&s, CHAT, 2),
        "the outgoing task must not evict the live stream — Stop would stop reaching it"
    );

    release_slot(&mut s, CHAT, 2);
    assert!(!slot_is_current(&s, CHAT, 2));
    assert!(s.is_empty());
}

#[test]
fn streams_of_different_chats_do_not_touch_each_other() {
    let mut s = slots();
    let other = CancellationToken::new();
    claim_slot(&mut s, "chat-a", 1, other.clone());
    claim_slot(&mut s, "chat-b", 2, CancellationToken::new());
    assert!(!other.is_cancelled());
    assert!(slot_is_current(&s, "chat-a", 1));
    assert!(slot_is_current(&s, "chat-b", 2));
}

#[test]
fn an_unknown_chat_is_never_current() {
    let s = slots();
    assert!(!slot_is_current(&s, CHAT, 1));
}

// --- the same invariants, through the service that owns the registry --------

use crate::llm::fallback_models;

fn service() -> LlmService {
    let catalog: crate::llm::ModelCatalog = Arc::new(Mutex::new(fallback_models()));
    let provider = crate::app_state::build_llm_client(
        &crate::secrets::Secrets::default(),
        Arc::clone(&catalog),
    );
    LlmService::new(provider, catalog)
}

/// Epochs are global, not per-chat: two chats streaming at once must not be
/// able to collide on the same number, or a stale task of one would pass for
/// the live stream of the other.
#[test]
fn epochs_are_issued_across_chats_not_per_chat() {
    let svc = service();
    let (first, _) = svc.begin_stream("chat-a");
    let (second, _) = svc.begin_stream("chat-b");
    assert_ne!(first, second);
    assert!(svc.is_current_stream("chat-a", first));
    assert!(svc.is_current_stream("chat-b", second));
}

#[test]
fn a_barge_in_cancels_the_answer_it_supersedes() {
    let svc = service();
    let (old_epoch, old_cancel) = svc.begin_stream(CHAT);
    let (new_epoch, _) = svc.begin_stream(CHAT);

    assert!(old_cancel.is_cancelled());
    assert!(!svc.is_current_stream(CHAT, old_epoch));
    assert!(svc.is_current_stream(CHAT, new_epoch));
}

#[test]
fn ending_a_superseded_stream_leaves_the_live_one_reachable_by_stop() {
    let svc = service();
    let (old_epoch, _) = svc.begin_stream(CHAT);
    let (new_epoch, live) = svc.begin_stream(CHAT);

    svc.end_stream(CHAT, old_epoch);
    assert!(svc.is_current_stream(CHAT, new_epoch));

    svc.cancel_stream(CHAT);
    assert!(live.is_cancelled(), "Stop обязан дойти до живого стрима");
    assert!(!svc.is_current_stream(CHAT, new_epoch));
}

#[test]
fn cancelling_an_unknown_chat_is_harmless() {
    let svc = service();
    svc.cancel_stream("нет такого");
    assert!(!svc.is_current_stream("нет такого", 1));
}

/// Rebuilding the provider on a key change must keep the SAME catalogue: the
/// provider resolves capabilities through it, and a fresh one would forget
/// every model the app had already learned about.
#[test]
fn replacing_the_provider_keeps_the_catalogue() {
    let svc = service();
    let catalog = svc.catalog();
    let rebuilt = crate::app_state::build_llm_client(
        &crate::secrets::Secrets::default(),
        svc.catalog(),
    );
    svc.replace_provider(rebuilt);
    assert!(Arc::ptr_eq(&catalog, &svc.catalog()));
    assert_eq!(svc.cached_models().len(), fallback_models().len());
}
