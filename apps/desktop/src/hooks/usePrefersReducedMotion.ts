import { useSyncExternalStore } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

const hasMatchMedia = () => typeof window.matchMedia === "function";

function subscribe(onChange: () => void): () => void {
  if (!hasMatchMedia()) return () => undefined;
  const media = window.matchMedia(REDUCED_MOTION_QUERY);
  media.addEventListener("change", onChange);
  return () => {
    media.removeEventListener("change", onChange);
  };
}

function snapshot(): boolean {
  return !hasMatchMedia() || window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, snapshot);
}
