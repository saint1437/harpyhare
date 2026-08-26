import { useEffect } from "react";
import { useLatestRef } from "@/hooks/useLatestRef";

const KEYDOWN_EVENT = "keydown";

/**
 * The one document-level keydown subscription every hotkey hook here used to
 * spell out by hand.
 *
 * The handler goes through a ref on purpose: a call site is free to pass an
 * inline arrow (App re-renders on every frame of a stream reveal), and without
 * the ref the listener would be torn off the document and put back on each of
 * those frames — exactly while the user is trying to press Escape.
 */
export function useDocumentKeydown(
  onKeyDown: (event: KeyboardEvent) => void,
  enabled = true,
): void {
  const onKeyDownRef = useLatestRef(onKeyDown);

  useEffect(() => {
    if (!enabled) return;
    const handle = (event: KeyboardEvent) => {
      onKeyDownRef.current(event);
    };
    document.addEventListener(KEYDOWN_EVENT, handle);
    return () => {
      document.removeEventListener(KEYDOWN_EVENT, handle);
    };
  }, [enabled, onKeyDownRef]);
}
