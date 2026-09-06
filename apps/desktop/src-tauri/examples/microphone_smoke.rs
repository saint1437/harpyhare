//! Local WASAPI/Core Audio smoke test. No STT requests or audio files.
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc,
};
use std::time::Duration;

use harpyhare_lib::capture::{list_input_devices, list_output_devices, SystemAudioCapture};

fn main() {
    let devices = list_input_devices();
    println!("Microphones: {devices:#?}");
    assert!(
        !devices.is_empty(),
        "Connect a microphone before running this smoke test"
    );
    assert!(SystemAudioCapture::new_microphone(Some("missing-microphone-uid")).is_err());
    if let Some(output) = list_output_devices().first() {
        assert!(SystemAudioCapture::new_microphone(Some(&output.uid)).is_err());
    }
    // Keep system capture running: selecting a microphone must not replace it.
    let mut system = SystemAudioCapture::new(None, 4).expect("open system capture");
    system.set_buffering(true);
    system.start(None).expect("start system capture");
    // Exercise every input, reopen the first one, then resolve the default afresh.
    let uids = devices
        .iter()
        .map(|d| Some(d.uid.as_str()))
        .chain([Some(devices[0].uid.as_str()), None]);
    for uid in uids {
        let mut capture = SystemAudioCapture::new_microphone(uid).expect("open microphone");
        let streamed = Arc::new(AtomicUsize::new(0));
        let sink_count = Arc::clone(&streamed);
        capture
            .start(Some(Box::new(move |chunk| {
                sink_count.fetch_add(chunk.len(), Ordering::Relaxed);
            })))
            .expect("start microphone");
        std::thread::sleep(Duration::from_secs(2));
        let samples = capture.stop().expect("stop microphone");
        assert!(
            samples.len() >= 16_000,
            "expected at least one second of audio"
        );
        assert!(
            samples.len() <= 48_000,
            "microphone must not include system preroll"
        );
        assert_eq!(samples.len(), streamed.load(Ordering::Relaxed));
        assert!(samples.iter().all(|s| s.is_finite()));
        println!(
            "uid={uid:?}: {} samples, rms={}",
            samples.len(),
            harpyhare_lib::audio::rms(&samples)
        );
        drop(capture);
        std::thread::sleep(Duration::from_millis(100));
    }
    let system_samples = system.stop().expect("stop independent system capture");
    assert!(system_samples.len() >= 16_000);
    assert!(system_samples.iter().all(|s| s.is_finite()));
    println!(
        "System capture continued independently: {} samples",
        system_samples.len()
    );
    println!("Microphone capture smoke test passed");
}
