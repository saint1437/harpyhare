const MS_PER_SECOND = 1000;
const HIGH_SURROGATE_MIN = 0xd800;
const HIGH_SURROGATE_MAX = 0xdbff;

export const REVEAL_MIN_CHARS_PER_SECOND = 100;
const REVEAL_BACKLOG_FRACTION_PER_SECOND = 10;

export function advanceReveal(revealed: number, total: number, dtMs: number): number {
  if (revealed >= total) return total;
  const dtSeconds = dtMs / MS_PER_SECOND;
  const backlog = total - revealed;
  const advance = Math.max(
    REVEAL_MIN_CHARS_PER_SECOND * dtSeconds,
    backlog * REVEAL_BACKLOG_FRACTION_PER_SECOND * dtSeconds,
  );
  return Math.min(total, revealed + advance);
}

export function sliceRevealed(text: string, revealed: number): string {
  const end = Math.min(text.length, Math.floor(revealed));
  if (end <= 0) return "";
  if (end < text.length) {
    const boundaryCode = text.charCodeAt(end - 1);
    if (boundaryCode >= HIGH_SURROGATE_MIN && boundaryCode <= HIGH_SURROGATE_MAX) {
      return text.slice(0, end + 1);
    }
  }
  return text.slice(0, end);
}
