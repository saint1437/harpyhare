import { useCallback, type MouseEvent } from "react";
import { startWindowDrag } from "@/ipc/commands";
import { isDraggableChromeTarget } from "@/lib/window-controls";

const PRIMARY_MOUSE_BUTTON = 0;

export function useWindowDrag(): (event: MouseEvent<HTMLElement>) => void {
  return useCallback((event: MouseEvent<HTMLElement>) => {
    if (event.button !== PRIMARY_MOUSE_BUTTON) return;
    if (!isDraggableChromeTarget(event.target)) return;
    void startWindowDrag();
  }, []);
}
