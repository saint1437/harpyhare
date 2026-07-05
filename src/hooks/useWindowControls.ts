import { useEffect } from "react";
import { moveWindowBy } from "@/ipc/commands";
import { moveDelta } from "@/lib/window-controls";

const KEYDOWN_EVENT = "keydown";
const OPACITY_UP_CODE = "Equal";
const OPACITY_DOWN_CODE = "Minus";
const SEND_CODE = "Enter";

function opacityStepFromEvent(e: KeyboardEvent): 1 | -1 | null {
  if (!(e.metaKey && e.shiftKey)) return null;
  if (e.code === OPACITY_UP_CODE) return 1;
  if (e.code === OPACITY_DOWN_CODE) return -1;
  return null;
}

export function useWindowControls(
  moveStep: number,
  onSend: () => void,
  onOpacityStep: (dir: 1 | -1) => void,
): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const opacityDir = opacityStepFromEvent(e);
      if (opacityDir !== null) {
        e.preventDefault();
        onOpacityStep(opacityDir);
        return;
      }
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.code === SEND_CODE) {
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
    document.addEventListener(KEYDOWN_EVENT, onKey);
    return () => {
      document.removeEventListener(KEYDOWN_EVENT, onKey);
    };
  }, [moveStep, onSend, onOpacityStep]);
}
