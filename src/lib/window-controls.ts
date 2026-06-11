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
