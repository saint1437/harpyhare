/// Порог RMS, ниже которого запись считается тишиной (стартовое значение по спеке, уточняется вручную).
pub const SILENCE_RMS_THRESHOLD: f32 = 1e-3;

/// Интерливленный многоканальный буфер -> моно (среднее каналов).
pub fn downmix_to_mono(interleaved: &[f32], channels: usize) -> Vec<f32> {
    if channels <= 1 {
        return interleaved.to_vec();
    }
    interleaved
        .chunks_exact(channels)
        .map(|frame| frame.iter().sum::<f32>() / channels as f32)
        .collect()
}

pub fn rms(samples: &[f32]) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }
    (samples.iter().map(|s| s * s).sum::<f32>() / samples.len() as f32).sqrt()
}

pub fn is_silence(samples: &[f32]) -> bool {
    rms(samples) < SILENCE_RMS_THRESHOLD
}

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
