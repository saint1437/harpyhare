use rubato::audioadapter_buffers::direct::InterleavedSlice;
use rubato::{
    Async, FixedAsync, Indexing, Resampler, SincInterpolationParameters, SincInterpolationType,
    WindowFunction,
};

pub const SILENCE_RMS_THRESHOLD: f32 = 1e-3;

pub const TARGET_SAMPLE_RATE: u32 = 16000;

const SPEECH_SINC_LEN: usize = 32;
const SPEECH_SINC_CUTOFF: f32 = 0.91;
const SPEECH_OVERSAMPLING_FACTOR: usize = 128;
const MAX_RESAMPLE_RATIO_RELATIVE: f64 = 2.0;
const RESAMPLE_CHUNK: usize = 1024;
const RESAMPLE_OUT_CAPACITY_HEADROOM: usize = 16;
const FINISH_ZERO_FILL_MAX_ROUNDS: usize = 1000;

const WAV_HEADER_LEN: usize = 44;
const WAV_UNKNOWN_SIZE: u32 = 0xFFFF_FFFF;
const WAV_FMT_CHUNK_SIZE: u32 = 16;
const WAV_FORMAT_PCM: u16 = 1;
const MONO_CHANNELS: u16 = 1;
const BITS_PER_SAMPLE: u16 = 16;
const BYTES_PER_SAMPLE: usize = BITS_PER_SAMPLE as usize / 8;

pub fn downmix_to_mono(interleaved: &[f32], channels: usize) -> Vec<f32> {
    let mut out = Vec::with_capacity(interleaved.len() / channels.max(1));
    downmix_into(interleaved, channels, &mut out);
    out
}

pub fn downmix_into(interleaved: &[f32], channels: usize, out: &mut Vec<f32>) {
    if channels <= 1 {
        out.extend_from_slice(interleaved);
        return;
    }
    out.extend(
        interleaved
            .chunks_exact(channels)
            .map(|frame| frame.iter().sum::<f32>() / channels as f32),
    );
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

#[derive(Debug, thiserror::Error)]
pub enum AudioError {
    #[error("ресемплинг: {0}")]
    Resample(String),
    #[error("wav: {0}")]
    Wav(String),
}

fn speech_sinc_params() -> SincInterpolationParameters {
    SincInterpolationParameters {
        sinc_len: SPEECH_SINC_LEN,
        f_cutoff: SPEECH_SINC_CUTOFF,
        interpolation: SincInterpolationType::Linear,
        oversampling_factor: SPEECH_OVERSAMPLING_FACTOR,
        window: WindowFunction::Blackman2,
    }
}

fn make_resampler(src_rate: u32) -> Result<Async<f32>, AudioError> {
    Async::<f32>::new_sinc(
        TARGET_SAMPLE_RATE as f64 / src_rate as f64,
        MAX_RESAMPLE_RATIO_RELATIVE,
        &speech_sinc_params(),
        RESAMPLE_CHUNK,
        1,
        FixedAsync::Input,
    )
    .map_err(|e| AudioError::Resample(e.to_string()))
}

pub fn resample_to_16k(mono: &[f32], src_rate: u32) -> Result<Vec<f32>, AudioError> {
    let mut rs = StreamResampler::new(src_rate)?;
    let expected_len =
        (mono.len() as f64 * f64::from(TARGET_SAMPLE_RATE) / f64::from(src_rate)) as usize;
    let mut out = Vec::with_capacity(expected_len + RESAMPLE_OUT_CAPACITY_HEADROOM);
    rs.feed(mono, &mut out)?;
    rs.finish(&mut out)?;
    Ok(out)
}

pub struct StreamResampler {
    rs: Option<Async<f32>>,
    stage: Vec<f32>,
    out_buf: Vec<f32>,
    to_trim: usize,
    in_total: usize,
    out_total: usize,
    ratio: f64,
}

impl StreamResampler {
    pub fn new(src_rate: u32) -> Result<Self, AudioError> {
        let (rs, to_trim, out_cap) = if src_rate == TARGET_SAMPLE_RATE {
            (None, 0, 0)
        } else {
            let rs = make_resampler(src_rate)?;
            let delay = rs.output_delay();
            let cap = rs.output_frames_max();
            (Some(rs), delay, cap)
        };
        Ok(Self {
            rs,
            stage: Vec::with_capacity(RESAMPLE_CHUNK * 2),
            out_buf: vec![0.0; out_cap],
            to_trim,
            in_total: 0,
            out_total: 0,
            ratio: f64::from(TARGET_SAMPLE_RATE) / f64::from(src_rate),
        })
    }

    fn run_chunk(
        &mut self,
        input: &[f32],
        partial: Option<usize>,
        out: &mut Vec<f32>,
        expected: Option<usize>,
    ) -> Result<usize, AudioError> {
        let rs = self
            .rs
            .as_mut()
            .expect("run_chunk только при активном ресемплере");
        let frames = input.len();
        let input_adapter = InterleavedSlice::new(input, 1, frames)
            .map_err(|e| AudioError::Resample(e.to_string()))?;
        let cap = self.out_buf.len();
        let mut output_adapter = InterleavedSlice::new_mut(&mut self.out_buf, 1, cap)
            .map_err(|e| AudioError::Resample(e.to_string()))?;
        let indexing = Indexing {
            input_offset: 0,
            output_offset: 0,
            partial_len: partial,
            active_channels_mask: None,
        };
        let (n_in, n_out) = rs
            .process_into_buffer(&input_adapter, &mut output_adapter, Some(&indexing))
            .map_err(|e| AudioError::Resample(e.to_string()))?;
        let skip = self.to_trim.min(n_out);
        self.to_trim -= skip;
        let mut chunk = &self.out_buf[skip..n_out];
        if let Some(exp) = expected {
            let room = exp.saturating_sub(self.out_total);
            if chunk.len() > room {
                chunk = &chunk[..room];
            }
        }
        self.out_total += chunk.len();
        out.extend_from_slice(chunk);
        Ok(n_in)
    }

    pub fn feed(&mut self, mono: &[f32], out: &mut Vec<f32>) -> Result<(), AudioError> {
        if self.rs.is_none() {
            out.extend_from_slice(mono);
            return Ok(());
        }
        let mut stage = std::mem::take(&mut self.stage);
        stage.extend_from_slice(mono);
        let mut off = 0;
        while stage.len() - off >= RESAMPLE_CHUNK {
            let n_in = self.run_chunk(&stage[off..off + RESAMPLE_CHUNK], None, out, None)?;
            if n_in == 0 {
                self.stage = stage;
                return Err(AudioError::Resample("ресемплер не потребил вход".into()));
            }
            self.in_total += n_in;
            off += n_in;
        }
        stage.drain(..off);
        self.stage = stage;
        Ok(())
    }

    pub fn finish(&mut self, out: &mut Vec<f32>) -> Result<(), AudioError> {
        if self.rs.is_none() {
            return Ok(());
        }
        self.in_total += self.stage.len();
        let expected = (self.in_total as f64 * self.ratio).ceil() as usize;
        let tail: Vec<f32> = std::mem::take(&mut self.stage);
        self.run_chunk(&tail, Some(tail.len()), out, Some(expected))?;
        for _ in 0..FINISH_ZERO_FILL_MAX_ROUNDS {
            if self.out_total >= expected {
                return Ok(());
            }
            self.run_chunk(&[], Some(0), out, Some(expected))?;
        }
        Err(AudioError::Resample(
            "finish не сошёлся к ожидаемой длине".into(),
        ))
    }
}

pub fn wav_header_streaming() -> [u8; 44] {
    let byte_rate = TARGET_SAMPLE_RATE * u32::from(MONO_CHANNELS) * BYTES_PER_SAMPLE as u32;
    let block_align = MONO_CHANNELS * BYTES_PER_SAMPLE as u16;
    let mut h = [0u8; WAV_HEADER_LEN];
    h[0..4].copy_from_slice(b"RIFF");
    h[4..8].copy_from_slice(&WAV_UNKNOWN_SIZE.to_le_bytes());
    h[8..12].copy_from_slice(b"WAVE");
    h[12..16].copy_from_slice(b"fmt ");
    h[16..20].copy_from_slice(&WAV_FMT_CHUNK_SIZE.to_le_bytes());
    h[20..22].copy_from_slice(&WAV_FORMAT_PCM.to_le_bytes());
    h[22..24].copy_from_slice(&MONO_CHANNELS.to_le_bytes());
    h[24..28].copy_from_slice(&TARGET_SAMPLE_RATE.to_le_bytes());
    h[28..32].copy_from_slice(&byte_rate.to_le_bytes());
    h[32..34].copy_from_slice(&block_align.to_le_bytes());
    h[34..36].copy_from_slice(&BITS_PER_SAMPLE.to_le_bytes());
    h[36..40].copy_from_slice(b"data");
    h[40..44].copy_from_slice(&WAV_UNKNOWN_SIZE.to_le_bytes());
    h
}

fn f32_sample_to_i16(sample: f32) -> i16 {
    (sample.clamp(-1.0, 1.0) * i16::MAX as f32) as i16
}

pub fn f32_to_i16le_bytes(samples: &[f32]) -> Vec<u8> {
    let mut out = Vec::with_capacity(samples.len() * BYTES_PER_SAMPLE);
    for s in samples {
        out.extend_from_slice(&f32_sample_to_i16(*s).to_le_bytes());
    }
    out
}

pub fn encode_wav_16k_mono(samples: &[f32]) -> Result<Vec<u8>, AudioError> {
    let spec = hound::WavSpec {
        channels: MONO_CHANNELS,
        sample_rate: TARGET_SAMPLE_RATE,
        bits_per_sample: BITS_PER_SAMPLE,
        sample_format: hound::SampleFormat::Int,
    };
    let mut cursor = std::io::Cursor::new(Vec::with_capacity(
        WAV_HEADER_LEN + samples.len() * BYTES_PER_SAMPLE,
    ));
    {
        let mut writer = hound::WavWriter::new(&mut cursor, spec)
            .map_err(|e| AudioError::Wav(e.to_string()))?;
        let mut w16 = writer.get_i16_writer(samples.len() as u32);
        for s in samples {
            w16.write_sample(f32_sample_to_i16(*s));
        }
        w16.flush().map_err(|e| AudioError::Wav(e.to_string()))?;
        writer.finalize().map_err(|e| AudioError::Wav(e.to_string()))?;
    }
    Ok(cursor.into_inner())
}

#[cfg(test)]
mod tests {
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
}
