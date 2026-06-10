#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn downmix_averages_channels() {
        // interleaved стерео: L=1.0 R=0.0, L=0.5 R=0.5
        let stereo = vec![1.0f32, 0.0, 0.5, 0.5];
        assert_eq!(downmix_to_mono(&stereo, 2), vec![0.5, 0.5]);
    }

    #[test]
    fn downmix_mono_passthrough() {
        assert_eq!(downmix_to_mono(&[0.3, -0.3], 1), vec![0.3, -0.3]);
    }

    #[test]
    fn rms_of_silence_is_zero_and_of_sine_is_positive() {
        assert_eq!(rms(&vec![0.0f32; 1600]), 0.0);
        let sine: Vec<f32> = (0..1600)
            .map(|i| (i as f32 * 0.1).sin() * 0.5)
            .collect();
        assert!(rms(&sine) > 0.3);
    }

    #[test]
    fn silence_gate_threshold() {
        let quiet = vec![0.0005f32; 16000];
        let loud = vec![0.05f32; 16000];
        assert!(is_silence(&quiet));
        assert!(!is_silence(&loud));
        assert!(is_silence(&[])); // пустой буфер — тоже тишина
    }
}
