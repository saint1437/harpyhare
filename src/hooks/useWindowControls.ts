import { useEffect } from "react";
import { moveWindowBy } from "@/ipc/commands";
import { moveDelta } from "@/lib/window-controls";

/**
 * Cmd/Ctrl+стрелки → move_window_by. Cmd+Enter обрабатывает App (для send),
 * поэтому здесь Enter тоже ловим и зовём onSend.
 */
export function useWindowControls(moveStep: number, onSend: () => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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
  }, [moveStep, onSend]);
}
