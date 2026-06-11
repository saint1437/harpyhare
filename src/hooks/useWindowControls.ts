import { useEffect } from "react";
import { moveWindowBy } from "@/ipc/commands";
import { moveDelta } from "@/lib/window-controls";

/**
 * Cmd/Ctrl+стрелки → move_window_by. Cmd+Enter → onSend.
 * Cmd+Shift+= / Cmd+Shift+- → onOpacityStep(±1) (прозрачность при фокусе HUD).
 */
export function useWindowControls(
  moveStep: number,
  onSend: () => void,
  onOpacityStep: (dir: 1 | -1) => void,
): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey && e.shiftKey && e.code === "Equal") {
        e.preventDefault();
        onOpacityStep(1);
        return;
      }
      if (e.metaKey && e.shiftKey && e.code === "Minus") {
        e.preventDefault();
        onOpacityStep(-1);
        return;
      }
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.code === "Enter") {
        e.preventDefault();
        onSend();
        return;
      }
      const delta = moveDelta(e.code, moveStep);
      if (delta) {
        e.preventDefault();
        void moveWindowBy(delta.dx, delta.dy);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [moveStep, onSend, onOpacityStep]);
}
