// Ручная приёмка: cargo run --example record5s --manifest-path src-tauri/Cargo.toml
// Проверяет весь новый пайплайн: RT-колбэк → ring buffer → консьюмер
// (downmix + инкрементальный ресемплинг в 16кГц) → готовый буфер + sink-чанки.
fn main() {
    let mut cap = itech_lib::capture::SystemAudioCapture::new().expect("создание tap");

    // Sink имитирует стриминговую загрузку: считаем отданные на лету сэмплы.
    let streamed = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let sink: itech_lib::capture::ChunkSink = Box::new({
        let streamed = std::sync::Arc::clone(&streamed);
        move |chunk: &[f32]| {
            streamed.fetch_add(chunk.len(), std::sync::atomic::Ordering::Relaxed);
        }
    });

    cap.start(Some(sink)).expect("старт");
    for i in 1..=5 {
        std::thread::sleep(std::time::Duration::from_secs(1));
        println!("{i}s: recording_secs={:.2}", cap.recording_secs());
    }
    let s16k = cap.stop().expect("стоп");
    let via_sink = streamed.load(std::sync::atomic::Ordering::Relaxed);
    println!(
        "итог: {} сэмплов 16кГц ({:.2}s), через sink ушло {}",
        s16k.len(),
        s16k.len() as f32 / 16000.0,
        via_sink
    );
    assert_eq!(s16k.len(), via_sink, "sink получает ровно то же, что и буфер");
    std::fs::write(
        "out.wav",
        itech_lib::audio::encode_wav_16k_mono(&s16k).unwrap(),
    )
    .unwrap();
    println!("rms={} → out.wav", itech_lib::audio::rms(&s16k));
}
