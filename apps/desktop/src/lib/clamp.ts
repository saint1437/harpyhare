/**
 * The one numeric clamp. Window size, opacity, chat font size and the
 * teleprompter's speed/font each carried a byte-identical private copy.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
