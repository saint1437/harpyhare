export const TELEPROMPTER_SPEED_MIN = 10;
export const TELEPROMPTER_SPEED_MAX = 150;
export const TELEPROMPTER_SPEED_STEP = 5;
export const TELEPROMPTER_FONT_MIN = 20;
export const TELEPROMPTER_FONT_MAX = 48;
export const TELEPROMPTER_FONT_STEP = 2;

const MILLIS_PER_SECOND = 1000;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clampSpeed(value: number): number {
  return clamp(value, TELEPROMPTER_SPEED_MIN, TELEPROMPTER_SPEED_MAX);
}

export function clampFont(value: number): number {
  return clamp(value, TELEPROMPTER_FONT_MIN, TELEPROMPTER_FONT_MAX);
}

export function advanceOffset(
  offset: number,
  speedPxPerSecond: number,
  elapsedMs: number,
  maxOffset: number,
): number {
  const advanced = offset + (speedPxPerSecond * elapsedMs) / MILLIS_PER_SECOND;
  return clamp(advanced, 0, Math.max(0, maxOffset));
}

const FENCE_LINE = /```[^\n]*\n?/g;
const INLINE_CODE = /`([^`]+)`/g;
const IMAGE = /!\[[^\]]*\]\([^)]*\)/g;
const LINK = /\[([^\]]+)\]\([^)]*\)/g;
const HEADING = /^[ \t]{0,3}#{1,6}[ \t]+/gm;
const BLOCKQUOTE = /^[ \t]{0,3}>[ \t]?/gm;
const BULLET = /^[ \t]*[-*+][ \t]+/gm;
const ORDERED = /^[ \t]*\d+\.[ \t]+/gm;
const BOLD = /\*\*([^*]+)\*\*/g;
const ITALIC = /\*([^*]+)\*/g;
const BOLD_UNDERSCORE = /__([^_]+)__/g;
const ITALIC_UNDERSCORE = /(?<![A-Za-zА-Яа-я0-9])_([^_]+)_(?![A-Za-zА-Яа-я0-9])/g;
const EXTRA_BLANK_LINES = /\n{3,}/g;

export function toReadingText(markdown: string): string {
  return markdown
    .replace(FENCE_LINE, "")
    .replace(IMAGE, "")
    .replace(LINK, "$1")
    .replace(INLINE_CODE, "$1")
    .replace(HEADING, "")
    .replace(BLOCKQUOTE, "")
    .replace(BULLET, "")
    .replace(ORDERED, "")
    .replace(BOLD, "$1")
    .replace(BOLD_UNDERSCORE, "$1")
    .replace(ITALIC, "$1")
    .replace(ITALIC_UNDERSCORE, "$1")
    .replace(EXTRA_BLANK_LINES, "\n\n")
    .trim();
}
