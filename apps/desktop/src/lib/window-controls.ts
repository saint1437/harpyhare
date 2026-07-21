const NON_DRAGGABLE_SELECTOR = "button, a, input, textarea, select, [role='tab'], [data-no-drag]";
const OPACITY_CSS_VAR = "--app-opacity";
const OPACITY_MIN = 0.2;
const OPACITY_MAX = 1;
const CHAT_FONT_SIZE_CSS_VAR = "--chat-font-size";
const CHAT_FONT_SIZE_MIN_PX = 10;
const CHAT_FONT_SIZE_MAX_PX = 20;
const HUNDREDTHS = 100;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundToHundredths(value: number): number {
  return Math.round(value * HUNDREDTHS) / HUNDREDTHS;
}

export function moveDelta(code: string, step: number): { dx: number; dy: number } | null {
  switch (code) {
    case "ArrowLeft":
      return { dx: -step, dy: 0 };
    case "ArrowRight":
      return { dx: step, dy: 0 };
    case "ArrowUp":
      return { dx: 0, dy: -step };
    case "ArrowDown":
      return { dx: 0, dy: step };
    default:
      return null;
  }
}

export function isDraggableChromeTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest(NON_DRAGGABLE_SELECTOR) === null;
}

export function applyOpacity(root: HTMLElement, value: number): void {
  if (!Number.isFinite(value)) return;
  const clamped = clamp(value, OPACITY_MIN, OPACITY_MAX);
  root.style.setProperty(OPACITY_CSS_VAR, String(clamped));
}

export function stepOpacity(current: number, dir: 1 | -1, step: number): number {
  return clamp(roundToHundredths(current + dir * step), OPACITY_MIN, OPACITY_MAX);
}

export function applyChatFontSize(root: HTMLElement, px: number): void {
  if (!Number.isFinite(px)) return;
  const clamped = clamp(px, CHAT_FONT_SIZE_MIN_PX, CHAT_FONT_SIZE_MAX_PX);
  root.style.setProperty(CHAT_FONT_SIZE_CSS_VAR, `${String(clamped)}px`);
}

const THEME_DATA_ATTR = "data-theme";
export const THEME_GRAY = "gray";
export const THEME_BLACK = "black";

export function applyTheme(root: HTMLElement, theme: string): void {
  root.setAttribute(THEME_DATA_ATTR, theme === THEME_BLACK ? THEME_BLACK : THEME_GRAY);
}
