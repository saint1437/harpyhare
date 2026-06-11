import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { hotkeyFromEvent } from "@/lib/hotkey-capture";

export interface HotkeyCaptureProps {
  value: string;
  onChange: (hotkey: string) => void;
}

/** Кнопка-захват: клик → «Нажмите клавиши…» → следующий валидный keydown пишет комбо. Esc — отмена. */
export function HotkeyCapture({ value, onChange }: HotkeyCaptureProps) {
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    if (!capturing) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === "Escape") {
        setCapturing(false);
        return;
      }
      const hk = hotkeyFromEvent(e);
      if (hk !== null) {
        onChange(hk);
        setCapturing(false);
      }
    };
    // capture-фаза, чтобы перехватить раньше window-controls/opacity
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
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
