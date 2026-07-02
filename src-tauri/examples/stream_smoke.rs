// Смоук стриминговой загрузки в живой Groq API (без захвата звука):
//   cargo run --example stream_smoke --manifest-path src-tauri/Cargo.toml
// Стримит 3с синтетического тона чанками с задержками (имитация записи) и
// проверяет, что Groq принимает chunked-тело WAV неизвестной длины (HTTP 200).
fn main() {
    let _ = dotenvy::from_path(std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../.env"));
    let key = std::env::var("GROQ_API_KEY").expect("GROQ_API_KEY в .env");
    let stt = itech_lib::stt::GroqStt::new(key);

    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(async move {
        let (tx, rx) = tokio::sync::mpsc::channel::<Result<Vec<u8>, std::io::Error>>(64);
        // «запись»: 3 секунды 220Гц-тона, порциями по 200мс в реальном времени
        tokio::spawn(async move {
            for step in 0..15 {
                let samples: Vec<f32> = (0..3200)
                    .map(|i| {
                        let t = (step * 3200 + i) as f32 / 16000.0;
                        (2.0 * std::f32::consts::PI * 220.0 * t).sin() * 0.3
                    })
                    .collect();
                if tx
                    .send(Ok(itech_lib::audio::f32_to_i16le_bytes(&samples)))
                    .await
                    .is_err()
                {
                    return;
                }
                tokio::time::sleep(std::time::Duration::from_millis(200)).await;
            }
            // tx дропается — EOF тела
        });

        use futures_util::StreamExt;
        let header = itech_lib::audio::wav_header_streaming().to_vec();
        let body = reqwest::Body::wrap_stream(
            futures_util::stream::iter([Ok::<Vec<u8>, std::io::Error>(header)]).chain(
                futures_util::stream::unfold(rx, |mut rx| async move {
                    rx.recv().await.map(|item| (item, rx))
                }),
            ),
        );

        let t = std::time::Instant::now();
        let res = stt
            .transcribe_stream(body, tokio_util::sync::CancellationToken::new())
            .await;
        // ~3s из них — сама «запись»; важна дельта после EOF
        println!("итог за {:?}: {:?}", t.elapsed(), res);
    });
}
