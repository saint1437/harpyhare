use super::*;

fn image(width: usize, height: usize, pixels: Vec<u8>) -> RgbImage {
    assert_eq!(pixels.len(), width * height * CHANNELS);
    RgbImage {
        pixels,
        width,
        height,
    }
}

fn solid(width: usize, height: usize, colour: [u8; CHANNELS]) -> RgbImage {
    image(
        width,
        height,
        colour.iter().copied().cycle().take(width * height * CHANNELS).collect(),
    )
}

/// A grey ramp: every pixel carries its own index in all three channels, so a
/// filter that picks instead of averaging is visible in the result.
fn ramp(width: usize, height: usize) -> RgbImage {
    let pixels = (0..width * height)
        .flat_map(|index| [index as u8; CHANNELS])
        .collect();
    image(width, height, pixels)
}

#[test]
fn an_image_within_the_cap_is_handed_back_untouched() {
    assert_eq!(target_size(1568, 900, MAX_LONG_EDGE_PX), None);
    assert_eq!(target_size(4, 4, MAX_LONG_EDGE_PX), None);
    let original = ramp(4, 4);
    let expected = original.pixels.clone();
    let capped = cap_long_edge(original, MAX_LONG_EDGE_PX);
    assert_eq!(capped.pixels, expected);
    assert_eq!((capped.width, capped.height), (4, 4));
}

#[test]
fn the_long_edge_lands_on_the_cap_and_the_aspect_ratio_survives() {
    assert_eq!(target_size(3136, 1960, MAX_LONG_EDGE_PX), Some((1568, 980)));
    assert_eq!(target_size(1960, 3136, MAX_LONG_EDGE_PX), Some((980, 1568)));
    // A side that would round to zero is kept at one pixel: an image with no
    // rows is not a smaller image, it is a broken PNG.
    assert_eq!(target_size(4000, 1, 100), Some((100, 1)));
}

#[test]
fn a_degenerate_image_is_never_resampled() {
    assert_eq!(target_size(0, 4000, MAX_LONG_EDGE_PX), None);
    assert_eq!(target_size(4000, 0, MAX_LONG_EDGE_PX), None);
    assert_eq!(target_size(4000, 4000, 0), None);
}

#[test]
fn the_output_buffer_matches_the_target_size() {
    let capped = cap_long_edge(ramp(8, 6), 4);
    assert_eq!((capped.width, capped.height), (4, 3));
    assert_eq!(capped.pixels.len(), 4 * 3 * CHANNELS);
}

#[test]
fn a_solid_colour_survives_the_resample() {
    let colour = [17u8, 200, 3];
    let capped = cap_long_edge(solid(9, 5, colour), 3);
    assert_eq!((capped.width, capped.height), (3, 2));
    for pixel in capped.pixels.chunks_exact(CHANNELS) {
        assert_eq!(pixel, colour.as_slice(), "ровный цвет не должен плыть");
    }
}

/// Halving must average each 2×2 block. Nearest-neighbour would answer with a
/// corner of the block — the whole point of the filter is that it does not.
#[test]
fn halving_averages_each_block_instead_of_picking_a_corner() {
    let source = ramp(4, 4);
    let capped = cap_long_edge(source, 2);
    assert_eq!((capped.width, capped.height), (2, 2));
    let averages: Vec<u8> = capped
        .pixels
        .chunks_exact(CHANNELS)
        .map(|pixel| pixel[0])
        .collect();
    // Blocks {0,1,4,5}, {2,3,6,7}, {8,9,12,13}, {10,11,14,15} — the four means
    // are 2.5, 4.5, 10.5 and 12.5, rounded away from zero.
    assert_eq!(averages, vec![3, 5, 11, 13]);
}

/// The reason a decent filter matters: a hard edge has to stay where it was,
/// with no ghost of it bleeding into the other half.
#[test]
fn a_hard_edge_keeps_its_position() {
    let black = [0u8; CHANNELS];
    let white = [255u8; CHANNELS];
    let mut pixels = Vec::new();
    for _ in 0..2 {
        pixels.extend_from_slice(&black);
        pixels.extend_from_slice(&black);
        pixels.extend_from_slice(&white);
        pixels.extend_from_slice(&white);
    }
    let capped = cap_long_edge(image(4, 2, pixels), 2);
    assert_eq!((capped.width, capped.height), (2, 1));
    assert_eq!(capped.pixels, [0, 0, 0, 255, 255, 255]);
}

/// A non-integer ratio is where a filter of fixed support starts skipping
/// samples: every source pixel must still contribute somewhere.
#[test]
fn a_fractional_ratio_covers_every_source_sample() {
    let source_len = 7;
    let spans = spans(source_len, 3);
    let mut covered = vec![0f32; source_len];
    for span in &spans {
        for (offset, weight) in span.weights.iter().enumerate() {
            covered[span.start + offset] += weight;
        }
    }
    for (sample, weight) in covered.iter().enumerate() {
        assert!(
            (weight - 1.0).abs() < 1e-5,
            "сэмпл {sample} покрыт с весом {weight}"
        );
    }
}
