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

    #[test]
    fn resample_48k_to_16k_keeps_duration() {
        let one_sec_48k: Vec<f32> = (0..48000)
            .map(|i| (2.0 * std::f32::consts::PI * 440.0 * i as f32 / 48000.0).sin())
            .collect();
        let out = resample_to_16k(&one_sec_48k, 48000).unwrap();
        // длительность сохраняется с точностью до чанка ресемплера
        assert!((out.len() as i64 - 16000).abs() < 200, "len={}", out.len());
        // сигнал не деградировал в ноль
        assert!(rms(&out) > 0.3);
    }

    #[test]
    fn resample_16k_is_passthrough() {
        let buf = vec![0.1f32; 1600];
        assert_eq!(resample_to_16k(&buf, 16000).unwrap(), buf);
    }

    #[test]
    fn wav_encoding_is_valid_16bit_mono_16k() {
        let samples = vec![0.0f32, 0.5, -0.5, 1.0, -1.0];
        let bytes = encode_wav_16k_mono(&samples).unwrap();
        let reader = hound::WavReader::new(std::io::Cursor::new(&bytes)).unwrap();
        let spec = reader.spec();
        assert_eq!(spec.sample_rate, 16000);
        assert_eq!(spec.channels, 1);
        assert_eq!(spec.bits_per_sample, 16);
        assert_eq!(reader.len(), 5);
    }
}
