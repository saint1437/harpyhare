import { useEffect } from "react";
import { onEvent } from "@/ipc/events";
import { matchesModifier, parseModifier } from "@/lib/hotkey-modifier";
import { OPACITY_MODIFIER } from "@/lib/hotkeys";
import { type WindowDimension } from "@/lib/window-size";

const KEYDOWN_EVENT = "keydown";
const OPACITY_UP_CODE = "Equal";
const OPACITY_DOWN_CODE = "Minus";
const SEND_CODE = "Enter";

type ResizeKeyHandler = (dim: WindowDimension, dir: 1 | -1) => void;

const OPACITY_MODIFIER_STATE = parseModifier(OPACITY_MODIFIER);

function opacityStepFromEvent(e: KeyboardEvent): 1 | -1 | null {
  if (!matchesModifier(e, OPACITY_MODIFIER_STATE)) return null;
  if (e.code === OPACITY_UP_CODE) return 1;
  if (e.code === OPACITY_DOWN_CODE) return -1;
  return null;
}

export function useWindowControls(
  onSend: () => void,
  onOpacityStep: (dir: 1 | -1) => void,
  onResizeKey: ResizeKeyHandler,
): void {
  useEffect(
    () =>
      onEvent("resize-key", ({ dim, dir }) => {
        onResizeKey(dim, dir);
      }),
    [onResizeKey],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const opacityDir = opacityStepFromEvent(e);
      if (opacityDir !== null) {
        e.preventDefault();
        onOpacityStep(opacityDir);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.code === SEND_CODE) {
        e.preventDefault();
        onSend();
      }
    };
    document.addEventListener(KEYDOWN_EVENT, onKey);
    return () => {
      document.removeEventListener(KEYDOWN_EVENT, onKey);
    };
  }, [onSend, onOpacityStep]);
}
