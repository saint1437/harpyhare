// Диагностика 400 от Anthropic: гоняет все варианты тела запроса, которые умеет
// собирать build_request_body, и печатает статус + тело ошибки.
//   cargo run --example llm_smoke --manifest-path src-tauri/Cargo.toml
fn main() {
    let _ = dotenvy::from_path(std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../.env"));
    let key = std::env::var("ANTHROPIC_API_KEY").expect("ANTHROPIC_API_KEY в .env");

    let msg = |role: &str, text: &str| itech_lib::llm::ChatMessage {
        role: role.into(),
        text: text.into(),
        images: vec![],
    };

    let single = vec![msg("user", "Ответь одним словом: столица Франции?")];
    let multi = vec![
        msg("user", "1+1?"),
        msg("assistant", "2"),
        msg("user", "а 2+2?"),
    ];
    let with_empty_assistant = vec![
        msg("user", "1+1?"),
        msg("assistant", ""),
        msg("user", "а 2+2?"),
    ];

    let cases: Vec<(&str, serde_json::Value)> = vec![
        (
            "opus thinking=on fast=off (база)",
            itech_lib::llm::build_request_body("claude-opus-4-8", "Кратко.", &single, true, false),
        ),
        (
            "opus thinking=off",
            itech_lib::llm::build_request_body("claude-opus-4-8", "Кратко.", &single, false, false),
        ),
        (
            "opus fast=on",
            itech_lib::llm::build_request_body("claude-opus-4-8", "Кратко.", &single, true, true),
        ),
        (
            "opus мультитёрн с кэшем",
            itech_lib::llm::build_request_body("claude-opus-4-8", "Кратко.", &multi, true, false),
        ),
        (
            "opus пустой assistant в истории",
            itech_lib::llm::build_request_body(
                "claude-opus-4-8",
                "Кратко.",
                &with_empty_assistant,
                true,
                false,
            ),
        ),
        (
            "opus без препромпта (system=\"\")",
            itech_lib::llm::build_request_body("claude-opus-4-8", "", &single, true, false),
        ),
    ];

    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(async move {
        let client = reqwest::Client::new();
        for (name, mut body) in cases {
            body["max_tokens"] = serde_json::json!(16); // дёшево: нам нужен только статус
            let mut req = client
                .post("https://api.anthropic.com/v1/messages")
                .header("x-api-key", &key)
                .header("anthropic-version", "2023-06-01");
            if body.get("speed").is_some() {
                req = req.header("anthropic-beta", "fast-mode-2026-02-01");
            }
            match req.json(&body).send().await {
                Ok(resp) => {
                    let status = resp.status().as_u16();
                    if status == 200 {
                        println!("[OK ] {name}");
                        drop(resp); // обрываем стрим сразу
                    } else {
                        let text = resp.text().await.unwrap_or_default();
                        println!("[{status}] {name}: {}", &text[..text.len().min(400)]);
                    }
                }
                Err(e) => println!("[NET] {name}: {e}"),
            }
        }
    });
}
