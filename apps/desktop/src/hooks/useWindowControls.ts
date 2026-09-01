import { useEffect, useMemo } from "react";
import { onEvent } from "@/ipc/events";
import type { HotkeyBinding } from "@/ipc/types";
import { matchesPrepared, prepareCombo } from "@/lib/hotkey-match";
import { matchesModifier, parseFamilyModifier, type ModifierState } from "@/lib/hotkey-modifier";
import { effectiveCombo } from "@/lib/hotkeys";
import { type WindowDimension } from "@/lib/window-size";

const KEYDOWN_EVENT = "keydown";
const OPACITY_UP_CODE = "Equal";
const OPACITY_DOWN_CODE = "Minus";
const FONT_UP_CODE = "BracketRight";
const FONT_DOWN_CODE = "BracketLeft";

type ResizeKeyHandler = (dim: WindowDimension, dir: 1 | -1) => void;

function familyStepFromEvent(
  e: KeyboardEvent,
  expected: ModifierState | null,
  upCode: string,
  downCode: string,
): 1 | -1 | null {
  if (expected === null || !matchesModifier(e, expected)) return null;
  if (e.code === upCode) return 1;
  if (e.code === downCode) return -1;
  return null;
}

export function useWindowControls(
  hotkeys: HotkeyBinding[],
  onSend: () => void,
  onOpacityStep: (dir: 1 | -1) => void,
  onChatFontStep: (dir: 1 | -1) => void,
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
  const chatFontModifier = effectiveCombo(hotkeys, "chat_font_size");
  const sendCombo = effectiveCombo(hotkeys, "send");
  const opacityState = useMemo(() => parseFamilyModifier(opacityModifier), [opacityModifier]);
  const chatFontState = useMemo(() => parseFamilyModifier(chatFontModifier), [chatFontModifier]);
  const preparedSend = useMemo(() => prepareCombo(sendCombo), [sendCombo]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const opacityDir = familyStepFromEvent(e, opacityState, OPACITY_UP_CODE, OPACITY_DOWN_CODE);
      if (opacityDir !== null) {
        e.preventDefault();
        onOpacityStep(opacityDir);
        return;
      }
      const fontDir = familyStepFromEvent(e, chatFontState, FONT_UP_CODE, FONT_DOWN_CODE);
      if (fontDir !== null) {
        e.preventDefault();
        onChatFontStep(fontDir);
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
  }, [onSend, onOpacityStep, onChatFontStep, opacityState, chatFontState, preparedSend]);
}
