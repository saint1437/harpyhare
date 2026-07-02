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

export function applyOpacity(root: HTMLElement, value: number): void {
  if (!Number.isFinite(value)) return;
  const clamped = Math.min(1, Math.max(0.2, value));
  root.style.setProperty("--app-opacity", String(clamped));
}

/** Шаг прозрачности с клампом [0.2, 1] и округлением до 2 знаков (без float-дрейфа). */
export function stepOpacity(current: number, dir: 1 | -1, step: number): number {
  const next = Math.round((current + dir * step) * 100) / 100;
  return Math.min(1, Math.max(0.2, next));
}

/** Размер шрифта чата: пишет --chat-font-size (px) с клампом [10, 20]. */
export function applyChatFontSize(root: HTMLElement, px: number): void {
  if (!Number.isFinite(px)) return;
  const clamped = Math.min(20, Math.max(10, px));
  root.style.setProperty("--chat-font-size", `${String(clamped)}px`);
}
