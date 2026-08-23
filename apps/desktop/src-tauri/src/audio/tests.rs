use super::*;

#[test]
fn downmix_averages_channels() {
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
    assert!(is_silence(&[]));
}

#[test]
fn resample_48k_to_16k_keeps_duration() {
    let one_sec_48k: Vec<f32> = (0..48000)
        .map(|i| (2.0 * std::f32::consts::PI * 440.0 * i as f32 / 48000.0).sin())
        .collect();
    let out = resample_to_16k(&one_sec_48k, 48000).unwrap();
    assert!((out.len() as i64 - 16000).abs() < 200, "len={}", out.len());
    assert!(rms(&out) > 0.3);
}

#[test]
fn resample_16k_is_passthrough() {
    let buf = vec![0.1f32; 1600];
    assert_eq!(resample_to_16k(&buf, 16000).unwrap(), buf);
}

#[test]
fn stream_resampler_chunked_matches_batch() {
    let one_sec_48k: Vec<f32> = (0..48000)
        .map(|i| (2.0 * std::f32::consts::PI * 440.0 * i as f32 / 48000.0).sin())
        .collect();
    let batch = resample_to_16k(&one_sec_48k, 48000).unwrap();

    let mut rs = StreamResampler::new(48000).unwrap();
    let mut streamed = Vec::new();
    for chunk in one_sec_48k.chunks(477) {
        rs.feed(chunk, &mut streamed).unwrap();
    }
    rs.finish(&mut streamed).unwrap();

    assert_eq!(streamed.len(), batch.len(), "длины совпадают");
    let max_diff = streamed
        .iter()
        .zip(&batch)
        .map(|(a, b)| (a - b).abs())
        .fold(0.0f32, f32::max);
    assert!(max_diff < 1e-4, "нарезка не влияет на сигнал, max_diff={max_diff}");
}

#[test]
fn stream_resampler_reproduces_sine() {
    let one_sec_48k: Vec<f32> = (0..48000)
        .map(|i| (2.0 * std::f32::consts::PI * 440.0 * i as f32 / 48000.0).sin())
        .collect();
    let out = resample_to_16k(&one_sec_48k, 48000).unwrap();
    assert_eq!(out.len(), 16000);
    let mid = &out[200..15800];
    let w = 2.0 * std::f64::consts::PI * 440.0 / 16000.0;
    let (mut a, mut b) = (0.0f64, 0.0f64);
    for (i, s) in mid.iter().enumerate() {
        let t = w * (i + 200) as f64;
        a += f64::from(*s) * t.sin();
        b += f64::from(*s) * t.cos();
    }
    a = a * 2.0 / mid.len() as f64;
    b = b * 2.0 / mid.len() as f64;
    let amplitude = (a * a + b * b).sqrt();
    assert!((amplitude - 1.0).abs() < 0.02, "амплитуда сохранена: {amplitude}");
    let residual = (mid
        .iter()
        .enumerate()
        .map(|(i, s)| {
            let t = w * (i + 200) as f64;
            let fit = a * t.sin() + b * t.cos();
            (f64::from(*s) - fit).powi(2)
        })
        .sum::<f64>()
        / mid.len() as f64)
        .sqrt();
    assert!(residual < 0.02, "кроме 440Гц в сигнале ничего нет, residual={residual}");
}

#[test]
fn stream_resampler_16k_is_passthrough() {
    let mut rs = StreamResampler::new(16000).unwrap();
    let mut out = Vec::new();
    rs.feed(&[0.1, 0.2], &mut out).unwrap();
    rs.feed(&[0.3], &mut out).unwrap();
    rs.finish(&mut out).unwrap();
    assert_eq!(out, vec![0.1, 0.2, 0.3]);
}

#[test]
fn wav_streaming_header_shape() {
    let h = wav_header_streaming();
    assert_eq!(&h[0..4], b"RIFF");
    assert_eq!(&h[8..12], b"WAVE");
    assert_eq!(&h[36..40], b"data");
    assert_eq!(u32::from_le_bytes(h[4..8].try_into().unwrap()), 0xFFFF_FFFF);
    assert_eq!(u32::from_le_bytes(h[40..44].try_into().unwrap()), 0xFFFF_FFFF);
    assert_eq!(u32::from_le_bytes(h[24..28].try_into().unwrap()), 16000);
    assert_eq!(u16::from_le_bytes(h[22..24].try_into().unwrap()), 1);
}

#[test]
fn f32_to_i16le_bytes_matches_wav_encoder() {
    let samples = vec![0.0f32, 0.5, -0.5, 1.0, -1.0];
    let bytes = f32_to_i16le_bytes(&samples);
    let wav = encode_wav_16k_mono(&samples).unwrap();
    assert_eq!(bytes, wav[44..], "тело data-чанка совпадает");
    assert_eq!(bytes.len(), samples.len() * 2);
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

#[test]
fn rolling_buffer_keeps_order_under_capacity() {
    let mut rb = RollingBuffer::new(1);
    rb.push_chunk(&[1.0, 2.0]);
    rb.push_chunk(&[3.0]);
    assert_eq!(rb.snapshot(), vec![1.0, 2.0, 3.0]);
}

#[test]
fn rolling_buffer_evicts_oldest_on_overflow() {
    let mut rb = RollingBuffer::new(1);
    let first: Vec<f32> = (0..TARGET_SAMPLE_RATE).map(|i| i as f32).collect();
    rb.push_chunk(&first);
    rb.push_chunk(&[-1.0, -2.0]);
    let snap = rb.snapshot();
    assert_eq!(snap.len(), TARGET_SAMPLE_RATE as usize);
    assert_eq!(snap[0], 2.0);
    assert_eq!(snap[snap.len() - 2..], [-1.0, -2.0]);
}

#[test]
fn rolling_buffer_chunk_larger_than_capacity_keeps_tail() {
    let mut rb = RollingBuffer::new(1);
    let big: Vec<f32> = (0..TARGET_SAMPLE_RATE * 2).map(|i| i as f32).collect();
    rb.push_chunk(&big);
    let snap = rb.snapshot();
    assert_eq!(snap.len(), TARGET_SAMPLE_RATE as usize);
    assert_eq!(snap[0], TARGET_SAMPLE_RATE as f32);
}

#[test]
fn rolling_buffer_shrink_capacity_trims_oldest() {
    let mut rb = RollingBuffer::new(2);
    let two_secs: Vec<f32> = (0..TARGET_SAMPLE_RATE * 2).map(|i| i as f32).collect();
    rb.push_chunk(&two_secs);
    rb.set_capacity_secs(1);
    let snap = rb.snapshot();
    assert_eq!(snap.len(), TARGET_SAMPLE_RATE as usize);
    assert_eq!(snap[0], TARGET_SAMPLE_RATE as f32);
}

#[test]
fn rolling_buffer_clear_empties() {
    let mut rb = RollingBuffer::new(1);
    rb.push_chunk(&[1.0, 2.0]);
    rb.clear();
    assert!(rb.snapshot().is_empty());
}

fn test_bounds() -> SegmenterBounds {
    SegmenterBounds { silence_ms: 300, min_utterance_ms: 200, max_utterance_secs: 2 }
}

fn voiced(ms: usize) -> Vec<f32> {
    (0..samples_for_ms(ms))
        .map(|i| (2.0 * std::f32::consts::PI * 220.0 * i as f32 / TARGET_SAMPLE_RATE as f32).sin() * 0.4)
        .collect()
}

fn quiet(ms: usize) -> Vec<f32> {
    vec![0.0f32; samples_for_ms(ms)]
}

#[test]
fn segmenter_emits_nothing_while_speech_continues() {
    let mut seg = SpeechSegmenter::new(test_bounds());
    assert!(seg.push(&voiced(500)).is_empty());
    assert!(seg.push(&quiet(100)).is_empty());
}

#[test]
fn segmenter_finalizes_after_trailing_silence() {
    let mut seg = SpeechSegmenter::new(test_bounds());
    assert!(seg.push(&voiced(500)).is_empty());
    let ready = seg.push(&quiet(400));
    assert_eq!(ready.len(), 1);
    let segment = &ready[0];
    assert!(segment.len() >= samples_for_ms(500), "len={}", segment.len());
    assert!(segment.len() < samples_for_ms(500 + 400), "trailing silence must be trimmed");
}

#[test]
fn segmenter_drops_utterance_shorter_than_minimum() {
    let mut seg = SpeechSegmenter::new(test_bounds());
    assert!(seg.push(&voiced(50)).is_empty());
    assert!(seg.push(&quiet(400)).is_empty());
}

#[test]
fn segmenter_ignores_pure_silence() {
    let mut seg = SpeechSegmenter::new(test_bounds());
    assert!(seg.push(&quiet(5000)).is_empty());
    assert!(seg.flush().is_none());
}

#[test]
fn segmenter_keeps_lead_in_before_speech_onset() {
    let mut seg = SpeechSegmenter::new(test_bounds());
    seg.push(&quiet(1000));
    assert!(seg.push(&voiced(400)).is_empty());
    let ready = seg.push(&quiet(400));
    assert_eq!(ready.len(), 1);
    assert!(ready[0].len() > samples_for_ms(400), "lead-in must be prepended");
}

#[test]
fn segmenter_cuts_monologue_at_max_duration_and_keeps_listening() {
    let mut seg = SpeechSegmenter::new(test_bounds());
    let ready = seg.push(&voiced(2500));
    assert_eq!(ready.len(), 1);
    assert!(ready[0].len() >= samples_for_secs(2));
    let tail = seg.push(&quiet(400));
    assert_eq!(tail.len(), 1, "speech after the cut still finalizes");
}

#[test]
fn segmenter_splits_two_utterances_separated_by_a_pause() {
    let mut seg = SpeechSegmenter::new(test_bounds());
    let mut all = Vec::new();
    all.extend(seg.push(&voiced(400)));
    all.extend(seg.push(&quiet(400)));
    all.extend(seg.push(&voiced(400)));
    all.extend(seg.push(&quiet(400)));
    assert_eq!(all.len(), 2);
}

#[test]
fn segmenter_handles_chunks_smaller_than_a_frame() {
    let mut seg = SpeechSegmenter::new(test_bounds());
    let speech = voiced(400);
    for piece in speech.chunks(37) {
        assert!(seg.push(piece).is_empty());
    }
    let silence = quiet(400);
    let mut ready = Vec::new();
    for piece in silence.chunks(37) {
        ready.extend(seg.push(piece));
    }
    assert_eq!(ready.len(), 1);
}

#[test]
fn segmenter_flush_returns_speech_in_flight() {
    let mut seg = SpeechSegmenter::new(test_bounds());
    seg.push(&voiced(400));
    let flushed = seg.flush().expect("speech in flight");
    assert!(flushed.len() >= samples_for_ms(400));
    assert!(seg.flush().is_none(), "flush must not repeat the same speech");
}
