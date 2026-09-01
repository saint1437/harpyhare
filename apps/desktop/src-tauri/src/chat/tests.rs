use super::*;

const CHAT: &str = "chat-1";
const OLD_STREAM: &str = "stream-old";
const NEW_STREAM: &str = "stream-new";

fn entry(stream_id: &str) -> ActiveLlmStream {
    ActiveLlmStream {
        stream_id: stream_id.to_string(),
        cancel: CancellationToken::new(),
    }
}

#[test]
fn take_stream_ignores_a_cancel_aimed_at_an_already_replaced_stream() {
    let mut map = StreamRegistry::new();
    replace_stream(&mut map, CHAT, entry(NEW_STREAM));
    assert!(take_stream(&mut map, CHAT, OLD_STREAM).is_none());
    assert!(map.contains_key(CHAT));
}

#[test]
fn take_stream_removes_only_its_own_stream() {
    let mut map = StreamRegistry::new();
    replace_stream(&mut map, CHAT, entry(OLD_STREAM));
    assert!(take_stream(&mut map, CHAT, OLD_STREAM).is_some());
    assert!(map.is_empty());
}

#[test]
fn replace_stream_hands_back_the_previous_stream_so_it_can_be_cancelled() {
    let mut map = StreamRegistry::new();
    replace_stream(&mut map, CHAT, entry(OLD_STREAM));
    let displaced = replace_stream(&mut map, CHAT, entry(NEW_STREAM)).expect("прежний стрим");
    assert_eq!(displaced.stream_id, OLD_STREAM);
    assert!(!displaced.cancel.is_cancelled());
    displaced.cancel.cancel();
    assert_eq!(map[CHAT].stream_id, NEW_STREAM);
}

#[test]
fn a_finished_old_stream_does_not_unregister_the_new_one() {
    let mut map = StreamRegistry::new();
    replace_stream(&mut map, CHAT, entry(OLD_STREAM));
    replace_stream(&mut map, CHAT, entry(NEW_STREAM));
    take_stream(&mut map, CHAT, OLD_STREAM);
    assert_eq!(map[CHAT].stream_id, NEW_STREAM);
}
