import { useEffect, useRef } from "react";

const AUTOSAVE_DEBOUNCE_MS = 600;

/**
 * The launcher has no "Save" button: a change to the local `draft` is debounced
 * and persisted on its own. Both drafts in the window — the panel's settings and
 * onboarding's — run on this timer, and the two tricks inside it are why it is a
 * hook and not a copy in each:
 *
 * - `save` is reached THROUGH a ref and is NOT an effect dependency: persisting
 *   ends in `adopt(getSettings())` → a re-render of the owner → a new callback
 *   identity, and depending on it would restart the effect and loop the autosave
 *   (save → adopt → re-render → save).
 * - the draft is compared against the last queued one BY IDENTITY — that is what
 *   skips the first render and the StrictMode remount, while every further change
 *   resets the timer through the cleanup.
 *
 * `paused` covers the moments when saving is already someone else's job: launch
 * persists the normalised draft itself, and finishing onboarding must not let a
 * queued save without `onboarding_done` land after the final one.
 */
export function useAutosavedDraft<T>(draft: T, paused: boolean, save: (draft: T) => void): void {
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const lastQueued = useRef(draft);
  useEffect(() => {
    if (paused || draft === lastQueued.current) return;
    lastQueued.current = draft;
    const timer = setTimeout(() => {
      saveRef.current(draft);
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [draft, paused]);
}
