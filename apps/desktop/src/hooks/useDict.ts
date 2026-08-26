import { useSyncExternalStore } from "react";
import { getDict, subscribeDictionary, type Dictionary } from "@/i18n";

/**
 * The dictionary as a React value — a five-line `useSyncExternalStore` binding
 * over a store that is not React's, exactly like `useNotifications`.
 *
 * The store lives in `@/i18n` rather than here because `lib/` reads it too, and
 * `lib/` is framework-free: a hook would have been unreachable from there.
 */
export function useDict(): Dictionary {
  return useSyncExternalStore(subscribeDictionary, getDict, getDict);
}
