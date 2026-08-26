import { useEffect, type RefObject } from "react";
import { useLatestRef } from "@/hooks/useLatestRef";
import { setWindowSize } from "@/ipc/commands";
import { onWindowResized, type LogicalWindowSize } from "@/ipc/events";
import { SETTINGS_LIMITS } from "@/ipc/types";
import { PREVIEW_EXTRA_WIDTH_PX } from "@/lib/shell-layout";
import { nativeSizeEcho, windowSizesEqual } from "@/lib/window-size";

export const PROGRAMMATIC_RESIZE_GUARD_MS = 600;

/** Settings → window. Asks Rust for the frame the current settings describe. */
export function useWindowFrameSync(
  windowWidth: number,
  windowHeight: number,
  previewOpen: boolean,
  collapsed: boolean,
  ready: boolean,
  nativeSizeRef: RefObject<LogicalWindowSize>,
  guardUntilRef: RefObject<number>,
): void {
  useEffect(() => {
    // A collapsed window never receives the full size: the resize hotkey used
    // to inflate the 80px orb to 960×680 with window_collapsed=true on both
    // sides. On expand the effect re-runs via the flag and delivers the target
    // — including the preview extra width, which Rust's set_collapsed knows
    // nothing about (the native-size echo is invalidated for the orb's
    // lifetime in the collapsed-changed handler, otherwise the pre-collapse
    // size would match the target and setWindowSize would never go out).
    if (!ready || collapsed) return;
    const extra = previewOpen ? PREVIEW_EXTRA_WIDTH_PX : 0;
    const target = { width: windowWidth + extra, height: windowHeight };
    if (windowSizesEqual(target, nativeSizeEcho(nativeSizeRef.current, extra))) return;
    guardUntilRef.current = Date.now() + PROGRAMMATIC_RESIZE_GUARD_MS;
    void setWindowSize(target.width, target.height);
  }, [windowWidth, windowHeight, previewOpen, collapsed, ready, nativeSizeRef, guardUntilRef]);
}

/** Window → settings. A size the user dragged with the mouse is adopted back. */
export function useNativeResizeSync(
  previewOpen: boolean,
  collapsedRef: RefObject<boolean>,
  ready: boolean,
  nativeSizeRef: RefObject<LogicalWindowSize>,
  guardUntilRef: RefObject<number>,
  applyNativeWindowSize: (width: number, height: number) => void,
): void {
  const previewOpenRef = useLatestRef(previewOpen);
  const readyRef = useLatestRef(ready);
  const applyRef = useLatestRef(applyNativeWindowSize);
  useEffect(() => {
    let pending = 0;
    const stop = onWindowResized((size) => {
      if (collapsedRef.current) return;
      // И независимо от любых гейтов: HUD не опускается ниже своего минимума,
      // поэтому кадр меньше него физически не может быть размером, который
      // выбрал пользователь. Без этой проверки кламп превращал 72px клубка в
      // минимальные 300×520, и они оседали как сохранённый размер окна.
      if (
        size.width < SETTINGS_LIMITS.windowWidth.min ||
        size.height < SETTINGS_LIMITS.windowHeight.min
      ) {
        return;
      }
      nativeSizeRef.current = size;
      if (!readyRef.current) return;
      if (Date.now() < guardUntilRef.current) return;
      if (pending !== 0) return;
      pending = requestAnimationFrame(() => {
        pending = 0;
        const latest = nativeSizeRef.current;
        const base = latest.width - (previewOpenRef.current ? PREVIEW_EXTRA_WIDTH_PX : 0);
        applyRef.current(base, latest.height);
      });
    });
    return () => {
      stop();
      cancelAnimationFrame(pending);
    };
  }, [nativeSizeRef, guardUntilRef, previewOpenRef, collapsedRef, readyRef, applyRef]);
}
