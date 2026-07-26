import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { hotkeyFromEvent, isModifierOnlyCode } from "@/lib/hotkey-capture";
import { formatCombo } from "@/lib/hotkeys";

export interface HotkeyCaptureProps {
  value: string;
  onChange: (hotkey: string) => void;
}

const CANCEL_CAPTURE_CODE = "Escape";
const LISTEN_IN_CAPTURE_PHASE = true;

export function HotkeyCapture({ value, onChange }: HotkeyCaptureProps) {
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    if (!capturing) return;
    const captureNextHotkey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === CANCEL_CAPTURE_CODE) {
        setCapturing(false);
        return;
      }
      if (isModifierOnlyCode(e.code)) return;
      const hotkey = hotkeyFromEvent(e);
      if (hotkey !== null) {
        onChange(hotkey);
        setCapturing(false);
      }
    };
    window.addEventListener("keydown", captureNextHotkey, LISTEN_IN_CAPTURE_PHASE);
    return () => {
      window.removeEventListener("keydown", captureNextHotkey, LISTEN_IN_CAPTURE_PHASE);
    };
  }, [capturing, onChange]);

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => {
        setCapturing((c) => !c);
      }}
      className="w-full justify-start font-mono"
    >
      {capturing ? "Жду сочетание · Esc отменит" : formatCombo(value) || "Не назначен"}
    </Button>
  );
}
