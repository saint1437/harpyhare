import { useEffect, useRef } from "react";
import { useLatestRef } from "@/hooks/useLatestRef";
import type { Settings } from "@/ipc/types";
import { normalizeDraft } from "@/lib/settings-draft";

const AUTOSAVE_DEBOUNCE_MS = 600;

export function useDraftAutosave(
  draft: Settings,
  launching: boolean,
  onSave: (next: Settings) => void,
): void {
  const onSaveRef = useLatestRef(onSave);
  const draftRef = useLatestRef(draft);
  const launchingRef = useLatestRef(launching);
  const lastQueuedDraft = useRef(draft);
  const pending = useRef(false);

  useEffect(() => {
    if (launching || draft === lastQueuedDraft.current) return;
    lastQueuedDraft.current = draft;
    pending.current = true;
    const timer = setTimeout(() => {
      pending.current = false;
      onSaveRef.current(normalizeDraft(draft));
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [draft, launching, onSaveRef]);

  useEffect(
    () => () => {
      if (!pending.current || launchingRef.current) return;
      pending.current = false;
      onSaveRef.current(normalizeDraft(draftRef.current));
    },
    [draftRef, launchingRef, onSaveRef],
  );
}
