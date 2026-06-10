// Ручная приёмка: cargo run --example record5s --manifest-path src-tauri/Cargo.toml
fn main() {
    let mut cap = itech_lib::capture::SystemAudioCapture::new().expect("создание tap");
    cap.start().expect("старт");
    std::thread::sleep(std::time::Duration::from_secs(5));
    let (buf, rate, ch) = cap.stop();
    println!("получено {} сэмплов, {} Гц, {} канала(ов)", buf.len(), rate, ch);
    let mono = itech_lib::audio::downmix_to_mono(&buf, ch);
    let s16k = itech_lib::audio::resample_to_16k(&mono, rate).unwrap();
    std::fs::write("out.wav", itech_lib::audio::encode_wav_16k_mono(&s16k).unwrap()).unwrap();
    println!("rms={}", itech_lib::audio::rms(&s16k));
}
