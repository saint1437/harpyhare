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
