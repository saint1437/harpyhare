export const WINDOW_WIDTH_MIN_PX = 300;
export const WINDOW_WIDTH_MAX_PX = 1600;
export const WINDOW_HEIGHT_MIN_PX = 520;
export const WINDOW_HEIGHT_MAX_PX = 1100;

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
