export const WINDOW_WIDTH_MIN_PX = 300;
export const WINDOW_WIDTH_MAX_PX = 1600;
export const WINDOW_HEIGHT_MIN_PX = 520;
export const WINDOW_HEIGHT_MAX_PX = 1100;

export const NATIVE_SIZE_EPSILON_PX = 1.5;

export type WindowDimension = "width" | "height";

export interface WindowSize {
  width: number;
  height: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clampWindowSize(size: WindowSize): WindowSize {
  return {
    width: clamp(size.width, WINDOW_WIDTH_MIN_PX, WINDOW_WIDTH_MAX_PX),
    height: clamp(size.height, WINDOW_HEIGHT_MIN_PX, WINDOW_HEIGHT_MAX_PX),
  };
}

export function stepWindowSize(
  size: WindowSize,
  dim: WindowDimension,
  dir: 1 | -1,
  step: number,
): WindowSize {
  if (dim === "width") {
    return {
      ...size,
      width: clamp(size.width + dir * step, WINDOW_WIDTH_MIN_PX, WINDOW_WIDTH_MAX_PX),
    };
  }
  return {
    ...size,
    height: clamp(size.height + dir * step, WINDOW_HEIGHT_MIN_PX, WINDOW_HEIGHT_MAX_PX),
  };
}

export function windowSizesEqual(a: WindowSize, b: WindowSize): boolean {
  return (
    Math.abs(a.width - b.width) < NATIVE_SIZE_EPSILON_PX &&
    Math.abs(a.height - b.height) < NATIVE_SIZE_EPSILON_PX
  );
}

export function nativeSizeEcho(native: WindowSize, extraWidth: number): WindowSize {
  const base = clampWindowSize({
    width: Math.round(native.width - extraWidth),
    height: Math.round(native.height),
  });
  return { width: base.width + extraWidth, height: base.height };
}
