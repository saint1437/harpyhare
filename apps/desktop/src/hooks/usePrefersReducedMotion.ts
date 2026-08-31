import { useSyncExternalStore } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

let cachedQuery: MediaQueryList | null = null;

function reducedMotionQuery(): MediaQueryList | null {
  if (cachedQuery !== null) return cachedQuery;
  if (typeof window.matchMedia !== "function") return null;
  cachedQuery = window.matchMedia(REDUCED_MOTION_QUERY);
  return cachedQuery;
}

function subscribe(onChange: () => void): () => void {
  const media = reducedMotionQuery();
  if (media === null) return () => undefined;
  media.addEventListener("change", onChange);
  return () => {
    media.removeEventListener("change", onChange);
  };
}

function snapshot(): boolean {
  const media = reducedMotionQuery();
  return media === null || media.matches;
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, snapshot);
}
