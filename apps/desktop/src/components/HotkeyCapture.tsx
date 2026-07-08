import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { hotkeyFromEvent } from "@/lib/hotkey-capture";

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
      onClick={() => {
        setCapturing((c) => !c);
      }}
      className="w-full justify-start font-mono"
    >
      {capturing ? "Нажмите клавиши…" : value || "Не задано"}
    </Button>
  );
}
