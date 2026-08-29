//! Capping a capture's resolution before it becomes a PNG.
//!
//! The Anthropic API downsamples anything past a ~1568 px long edge on arrival,
//! and the same image is re-uploaded on EVERY turn of a chat — the API is
//! stateless, so the whole history travels again. A Retina region shot is 2×
//! oversampled, usually lands well under the frontend's 5 MB downscale
//! threshold and is therefore never touched, so the oversampling is paid for on
//! every request instead of being thrown away once. Capping it where the
//! capture is produced costs a single resample.
//!
//! The Windows backend is the only production caller. On macOS the pixels never
//! reach Rust (the PNG comes out of ImageIO inside `region_capture.c`, which
//! caps through CoreGraphics for the same reason and is handed the SAME limit
//! across the FFI so the two cannot drift). The code still lives here rather
//! than inside `windows.rs` because `cargo test` runs on macOS — a resampler
//! behind `cfg(target_os = "windows")` would be tested on no machine at all.

/// The long edge the API itself downsamples to.
pub const MAX_LONG_EDGE_PX: usize = 1568;

/// Bytes per pixel in the buffers below: R, G, B, no alpha — screenshots are
/// opaque and the PNG the frontend receives has never carried a fourth channel.
pub const CHANNELS: usize = 3;

const MIN_SIDE_PX: usize = 1;
const CHANNEL_MIN: f32 = 0.0;
const CHANNEL_MAX: f32 = 255.0;
/// The weight a degenerate span falls back to, so the divisor is never zero.
const FULL_WEIGHT: f32 = 1.0;

/// Tightly packed 8-bit RGB rows: what a backend cuts out of its screen copy
/// and what the PNG encoder takes.
pub struct RgbImage {
    pub pixels: Vec<u8>,
    pub width: usize,
    pub height: usize,
}

/// Scales the image down so neither side exceeds `max_long_edge`, or hands it
/// back untouched when it already fits.
pub fn cap_long_edge(image: RgbImage, max_long_edge: usize) -> RgbImage {
    match target_size(image.width, image.height, max_long_edge) {
        Some((width, height)) => resample(&image, width, height),
        None => image,
    }
}

/// `None` = nothing to do; the caller keeps the original buffer.
fn target_size(width: usize, height: usize, max_long_edge: usize) -> Option<(usize, usize)> {
    let long_edge = width.max(height);
    if width == 0 || height == 0 || max_long_edge == 0 || long_edge <= max_long_edge {
        return None;
    }
    let factor = max_long_edge as f64 / long_edge as f64;
    Some((scaled_side(width, factor), scaled_side(height, factor)))
}

fn scaled_side(side: usize, factor: f64) -> usize {
    let scaled = (side as f64 * factor).round();
    (scaled as usize).max(MIN_SIDE_PX)
}

/// The source samples one output pixel is built from, along one axis.
struct Span {
    start: usize,
    /// How much of each consecutive source sample the output pixel covers.
    weights: Vec<f32>,
}

/// A separable area filter: every output pixel is the average of the source
/// pixels its footprint covers, the samples at the edges of that footprint
/// weighted by how much of them it actually covers.
///
/// Nearest-neighbour would drop every other row and turn text — the reason the
/// screenshot feature exists at all — into noise. Area averaging is what a
/// browser canvas and CoreGraphics do for a reduction of this size, and for a
/// downscale it beats a triangle filter of fixed support: at 2× the footprint
/// is two whole samples wide, so nothing is skipped and nothing is smeared.
fn spans(source_len: usize, target_len: usize) -> Vec<Span> {
    let scale = source_len as f64 / target_len as f64;
    (0..target_len)
        .map(|index| {
            let begin = index as f64 * scale;
            let end = ((index + 1) as f64 * scale).min(source_len as f64);
            let start = (begin.floor() as usize).min(source_len - 1);
            let stop = (end.ceil() as usize).clamp(start + 1, source_len);
            let mut weights: Vec<f32> = (start..stop)
                .map(|sample| {
                    let lower = (sample as f64).max(begin);
                    let upper = ((sample + 1) as f64).min(end);
                    (upper - lower).max(0.0) as f32
                })
                .collect();
            if weights.iter().all(|weight| *weight <= 0.0) {
                weights = vec![FULL_WEIGHT];
            }
            Span { start, weights }
        })
        .collect()
}

fn resample(image: &RgbImage, width: usize, height: usize) -> RgbImage {
    let columns = spans(image.width, width);
    let rows = spans(image.height, height);
    let mut pixels = vec![0u8; width * height * CHANNELS];
    for (y, row) in rows.iter().enumerate() {
        for (x, column) in columns.iter().enumerate() {
            let mut sums = [0f32; CHANNELS];
            let mut total = 0f32;
            for (dy, weight_y) in row.weights.iter().enumerate() {
                let line = (row.start + dy) * image.width;
                for (dx, weight_x) in column.weights.iter().enumerate() {
                    let weight = weight_y * weight_x;
                    let at = (line + column.start + dx) * CHANNELS;
                    for (channel, sum) in sums.iter_mut().enumerate() {
                        *sum += weight * f32::from(image.pixels[at + channel]);
                    }
                    total += weight;
                }
            }
            let out = (y * width + x) * CHANNELS;
            for (channel, sum) in sums.iter().enumerate() {
                pixels[out + channel] = rounded_channel(sum / total);
            }
        }
    }
    RgbImage {
        pixels,
        width,
        height,
    }
}

fn rounded_channel(value: f32) -> u8 {
    value.round().clamp(CHANNEL_MIN, CHANNEL_MAX) as u8
}

#[cfg(test)]
mod tests;
