use super::*;

fn request_with(text: String, image_bytes: usize) -> llm::LlmRequest {
    llm::LlmRequest {
        model: "claude-haiku-4-5-20251001".into(),
        system: String::new(),
        messages: vec![llm::ChatMessage {
            role: "user".into(),
            text,
            images: vec![llm::ImageAttachment {
                media_type: "image/png".into(),
                data: "a".repeat(image_bytes),
            }],
        }],
        options: llm::RequestOptions::default(),
    }
}

/// An ordinary chat — even a long one — is still projected. The gauge is the
/// point of the command, and a ceiling that swallowed the normal case would
/// simply have turned the indicator off.
#[test]
fn an_ordinary_history_is_still_projected() {
    assert!(worth_projecting(&request_with("вопрос".into(), 64 * 1024)));
}

/// The case the ceiling exists for: one screenshot in the history, re-uploaded
/// on every message added to the chat, for a number the gauge can get from
/// `lastInputTokens` instead.
#[test]
fn a_history_carrying_a_multi_megabyte_image_is_not() {
    assert!(!worth_projecting(&request_with(
        String::new(),
        MAX_PROJECTED_REQUEST_BYTES + 1
    )));
}

/// The boundary is inclusive, and it is measured over the same bytes the send
/// path measures — `llm::request_size_bytes`, not a second formula.
#[test]
fn the_ceiling_itself_is_allowed_through() {
    assert!(worth_projecting(&request_with(
        String::new(),
        MAX_PROJECTED_REQUEST_BYTES - "image/png".len()
    )));
}

/// The skip has to be a number the frontend already knows how to fall back
/// from: `usedTokens = projected || lastInputTokens` in the HUD.
#[test]
fn the_skipped_answer_is_the_frontends_no_data_value() {
    assert_eq!(NO_PROJECTION, 0);
}
