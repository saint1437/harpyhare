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

const SEGMENT_FRAME_MS: usize = 10;
/// How much of the utterance buffer is reserved up front. The segmenter now
/// keeps that buffer across utterances, so this is paid once per auto-listening
/// session instead of being regrown from zero every segment. It is a cap rather
/// than `max_utterance_secs` itself: the setting goes to 120 s, and holding
/// 7.7 MB idle to save a handful of growth steps is the wrong trade.
const UTTERANCE_PREALLOC_SECS: usize = 30;
const SEGMENT_LEAD_IN_MS: usize = 200;
const SEGMENT_TAIL_KEEP_MS: usize = 120;

const WAV_HEADER_LEN: usize = 44;
const WAV_UNKNOWN_SIZE: u32 = 0xFFFF_FFFF;
const WAV_FMT_CHUNK_SIZE: u32 = 16;
const WAV_FORMAT_PCM: u16 = 1;
const MONO_CHANNELS: u16 = 1;
const BITS_PER_SAMPLE: u16 = 16;
const BYTES_PER_SAMPLE: usize = BITS_PER_SAMPLE as usize / 8;

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

pub struct RollingBuffer {
    buf: std::collections::VecDeque<f32>,
    capacity: usize,
}

fn rolling_capacity_for_secs(secs: u64) -> usize {
    secs as usize * TARGET_SAMPLE_RATE as usize
}

impl RollingBuffer {
    pub fn new(secs: u64) -> Self {
        Self {
            buf: std::collections::VecDeque::new(),
            capacity: rolling_capacity_for_secs(secs),
        }
    }

    pub fn push_chunk(&mut self, chunk: &[f32]) {
        if self.capacity == 0 {
            return;
        }
        let skip = chunk.len().saturating_sub(self.capacity);
        self.buf.extend(&chunk[skip..]);
        self.trim_to_capacity();
    }

    /// Two `memcpy`s out of the deque's two halves rather than one push per
    /// element: `capture.rs` calls this while holding the `rolling` mutex, and
    /// the buffer runs to 160 000 samples at the ten-second cap.
    pub fn snapshot(&self) -> Vec<f32> {
        let (front, back) = self.buf.as_slices();
        let mut out = Vec::with_capacity(self.buf.len());
        out.extend_from_slice(front);
        out.extend_from_slice(back);
        out
    }

    pub fn set_capacity_secs(&mut self, secs: u64) {
        self.capacity = rolling_capacity_for_secs(secs);
        self.trim_to_capacity();
    }

    pub fn clear(&mut self) {
        self.buf.clear();
    }

    fn trim_to_capacity(&mut self) {
        let overflow = self.buf.len().saturating_sub(self.capacity);
        if overflow > 0 {
            self.buf.drain(..overflow);
        }
    }
}

pub fn samples_for_ms(ms: usize) -> usize {
    ms * TARGET_SAMPLE_RATE as usize / 1000
}

pub fn samples_for_secs(secs: usize) -> usize {
    secs * TARGET_SAMPLE_RATE as usize
}

pub struct SegmenterBounds {
    pub silence_ms: usize,
    pub min_utterance_ms: usize,
    pub max_utterance_secs: usize,
}

pub struct SpeechSegmenter {
    frame: usize,
    silence_samples: usize,
    min_samples: usize,
    max_samples: usize,
    lead_in_capacity: usize,
    tail_keep_samples: usize,
    pending: Vec<f32>,
    /// The frame buffer `pending` is swapped with once it is full, so that
    /// cutting a frame never allocates. See `push`.
    spare: Vec<f32>,
    lead_in: std::collections::VecDeque<f32>,
    utterance: Vec<f32>,
    trailing_silence: usize,
    speaking: bool,
}

impl SpeechSegmenter {
    pub fn new(bounds: SegmenterBounds) -> Self {
        let frame = samples_for_ms(SEGMENT_FRAME_MS).max(1);
        let max_samples = samples_for_secs(bounds.max_utterance_secs).max(frame);
        Self {
            frame,
            silence_samples: samples_for_ms(bounds.silence_ms).max(frame),
            min_samples: samples_for_ms(bounds.min_utterance_ms),
            max_samples,
            lead_in_capacity: samples_for_ms(SEGMENT_LEAD_IN_MS),
            tail_keep_samples: samples_for_ms(SEGMENT_TAIL_KEEP_MS),
            pending: Vec::with_capacity(frame),
            spare: Vec::with_capacity(frame),
            lead_in: std::collections::VecDeque::new(),
            utterance: Vec::with_capacity(max_samples.min(samples_for_secs(UTTERANCE_PREALLOC_SECS))),
            trailing_silence: 0,
            speaking: false,
        }
    }

    pub fn push(&mut self, chunk: &[f32]) -> Vec<Vec<f32>> {
        let mut ready = Vec::new();
        let mut rest = chunk;
        while !rest.is_empty() {
            let want = self.frame - self.pending.len();
            let take = want.min(rest.len());
            self.pending.extend_from_slice(&rest[..take]);
            rest = &rest[take..];
            if self.pending.len() < self.frame {
                break;
            }
            // Two buffers traded back and forth, never a fresh allocation: a
            // frame is 10 ms, so this runs 100 times a second per source (200 in
            // auto mode) with the `segmenting` mutex held, and every round used
            // to be a malloc plus a free.
            let mut frame = std::mem::replace(&mut self.pending, std::mem::take(&mut self.spare));
            if let Some(segment) = self.consume_frame(&frame) {
                ready.push(segment);
            }
            frame.clear();
            self.spare = frame;
        }
        ready
    }

    pub fn flush(&mut self) -> Option<Vec<f32>> {
        let mut pending = std::mem::replace(&mut self.pending, std::mem::take(&mut self.spare));
        if self.speaking && !pending.is_empty() {
            self.utterance.extend_from_slice(&pending);
        }
        pending.clear();
        self.spare = pending;
        self.lead_in.clear();
        if !self.speaking {
            return None;
        }
        self.finish_utterance()
    }

    fn consume_frame(&mut self, frame: &[f32]) -> Option<Vec<f32>> {
        if !self.speaking {
            if is_silence(frame) {
                self.remember_lead_in(frame);
                return None;
            }
            self.speaking = true;
            self.utterance.extend(self.lead_in.drain(..));
        }
        self.utterance.extend_from_slice(frame);
        if is_silence(frame) {
            self.trailing_silence += frame.len();
        } else {
            self.trailing_silence = 0;
        }
        if self.trailing_silence >= self.silence_samples {
            return self.finish_utterance();
        }
        if self.utterance.len() >= self.max_samples {
            return Some(self.cut_long_utterance());
        }
        None
    }

    fn remember_lead_in(&mut self, frame: &[f32]) {
        if self.lead_in_capacity == 0 {
            return;
        }
        self.lead_in.extend(frame);
        let overflow = self.lead_in.len().saturating_sub(self.lead_in_capacity);
        if overflow > 0 {
            self.lead_in.drain(..overflow);
        }
    }

    /// `drain` rather than `mem::take`, here and in `cut_long_utterance`: taking
    /// the `Vec` hands its allocation to the caller and leaves the segmenter to
    /// regrow from zero — about twenty growth steps copying ~4 MB per segment at
    /// a 30-second ceiling. Draining copies the segment out once and leaves the
    /// buffer where it is.
    fn finish_utterance(&mut self) -> Option<Vec<f32>> {
        let trim = self.trailing_silence.saturating_sub(self.tail_keep_samples);
        let keep = self.utterance.len().saturating_sub(trim);
        let segment: Vec<f32> = self.utterance.drain(..keep).collect();
        self.utterance.clear();
        self.speaking = false;
        self.trailing_silence = 0;
        (segment.len() >= self.min_samples).then_some(segment)
    }

    fn cut_long_utterance(&mut self) -> Vec<f32> {
        self.trailing_silence = 0;
        self.utterance.drain(..).collect()
    }
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

const ERR_NO_RESAMPLER: &str = "ресемплер не инициализирован";

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
        // A resampler is always present at this point by construction, but the
        // consumer thread that calls this holds a mutex the whole capture domain
        // shares: a panic here poisons it and takes PTT, auto listening and the
        // audio check down with it, forever.
        let rs = self
            .rs
            .as_mut()
            .ok_or_else(|| AudioError::Resample(ERR_NO_RESAMPLER.into()))?;
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

pub fn wav_header_streaming() -> [u8; WAV_HEADER_LEN] {
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

/// How many bytes `f32_to_i16le_into` appends for `samples` samples.
pub const fn i16le_len(samples: usize) -> usize {
    samples * BYTES_PER_SAMPLE
}

/// Appends the samples as little-endian i16 to `out`.
///
/// The `_into` shape exists so the streaming sink can coalesce many resampler
/// outputs into one reusable buffer instead of allocating a `Vec` per 21 ms
/// chunk; one `resize` plus a fill also replaces a two-byte `extend_from_slice`
/// per sample.
pub fn f32_to_i16le_into(samples: &[f32], out: &mut Vec<u8>) {
    let start = out.len();
    out.resize(start + i16le_len(samples.len()), 0);
    for (dst, s) in out[start..]
        .chunks_exact_mut(BYTES_PER_SAMPLE)
        .zip(samples)
    {
        dst.copy_from_slice(&f32_sample_to_i16(*s).to_le_bytes());
    }
}

pub fn f32_to_i16le_bytes(samples: &[f32]) -> Vec<u8> {
    let mut out = Vec::with_capacity(i16le_len(samples.len()));
    f32_to_i16le_into(samples, &mut out);
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
mod tests;
