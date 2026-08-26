import { clamp } from "./clamp";

const NON_DRAGGABLE_SELECTOR = "button, a, input, textarea, select, [role='tab'], [data-no-drag]";
const OPACITY_CSS_VAR = "--app-opacity";
// Below 0.75 the translucent HUD shell drops under AA against a light desktop
// (measured 1.30:1 at the old 0.2 floor). Pinned to Rust by window-controls.test.ts.
const OPACITY_MIN = 0.75;
const OPACITY_MAX = 1;
const CHAT_FONT_SIZE_CSS_VAR = "--chat-font-size";
const CHAT_FONT_SIZE_MIN_PX = 10;
const CHAT_FONT_SIZE_MAX_PX = 20;
const HUNDREDTHS = 100;

function roundToHundredths(value: number): number {
  return Math.round(value * HUNDREDTHS) / HUNDREDTHS;
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
export const THEME_SYSTEM = "system";
export const THEME_LIGHT = "light";
export const THEME_DARK = "dark";

export const THEMES = [THEME_SYSTEM, THEME_LIGHT, THEME_DARK] as const;
export type Theme = (typeof THEMES)[number];

function isExplicit(theme: string): theme is typeof THEME_LIGHT | typeof THEME_DARK {
  return theme === THEME_LIGHT || theme === THEME_DARK;
}

/**
 * `system` REMOVES the attribute rather than resolving the preference here: the
 * stylesheet already answers it with `prefers-color-scheme`, and resolving it in
 * JS would freeze the choice at load and stop following a mid-session OS switch.
 */
export function applyTheme(root: HTMLElement, theme: string): void {
  if (isExplicit(theme)) root.setAttribute(THEME_DATA_ATTR, theme);
  else root.removeAttribute(THEME_DATA_ATTR);
}
