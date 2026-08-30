import { useEffect, useMemo } from "react";
import { onEvent } from "@/ipc/events";
import type { HotkeyBinding } from "@/ipc/types";
import { matchesPrepared, prepareCombo } from "@/lib/hotkey-match";
import { matchesModifier, parseModifier } from "@/lib/hotkey-modifier";
import { effectiveCombo } from "@/lib/hotkeys";
import { type WindowDimension } from "@/lib/window-size";

const KEYDOWN_EVENT = "keydown";
const OPACITY_UP_CODE = "Equal";
const OPACITY_DOWN_CODE = "Minus";

type ResizeKeyHandler = (dim: WindowDimension, dir: 1 | -1) => void;

function opacityStepFromEvent(
  e: KeyboardEvent,
  expected: ReturnType<typeof parseModifier> | null,
): 1 | -1 | null {
  if (expected === null || !matchesModifier(e, expected)) return null;
  if (e.code === OPACITY_UP_CODE) return 1;
  if (e.code === OPACITY_DOWN_CODE) return -1;
  return null;
}

export function useWindowControls(
  hotkeys: HotkeyBinding[],
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

  const opacityModifier = effectiveCombo(hotkeys, "opacity");
  const sendCombo = effectiveCombo(hotkeys, "send");
  const opacityState = useMemo(
    () => (opacityModifier.trim() === "" ? null : parseModifier(opacityModifier)),
    [opacityModifier],
  );
  const preparedSend = useMemo(() => prepareCombo(sendCombo), [sendCombo]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const opacityDir = opacityStepFromEvent(e, opacityState);
      if (opacityDir !== null) {
        e.preventDefault();
        onOpacityStep(opacityDir);
        return;
      }
      if (matchesPrepared(e, preparedSend)) {
        e.preventDefault();
        onSend();
      }
    };
    document.addEventListener(KEYDOWN_EVENT, onKey);
    return () => {
      document.removeEventListener(KEYDOWN_EVENT, onKey);
    };
  }, [onSend, onOpacityStep, opacityState, preparedSend]);
}
