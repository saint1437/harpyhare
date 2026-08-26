import { vi } from "vitest";

const jestTimersShimForTestingLibrary = {
  advanceTimersByTime: (ms: number) => vi.advanceTimersByTime(ms),
};

(globalThis as Record<string, unknown>)["jest"] = jestTimersShimForTestingLibrary;

const LOCAL_STORAGE_GLOBAL = "localStorage";

function inMemoryStorage(): Storage {
  const entries = new Map<string, string>();
  return {
    get length() {
      return entries.size;
    },
    key: (index: number) => [...entries.keys()][index] ?? null,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, value);
    },
    removeItem: (key: string) => {
      entries.delete(key);
    },
    clear: () => {
      entries.clear();
    },
  };
}

const nodeShadowsJsdomLocalStorage =
  (globalThis as Record<string, unknown>)[LOCAL_STORAGE_GLOBAL] === undefined;

if (nodeShadowsJsdomLocalStorage) {
  Object.defineProperty(globalThis, LOCAL_STORAGE_GLOBAL, {
    value: inMemoryStorage(),
    configurable: true,
    writable: true,
  });
}

const RESIZE_OBSERVER_GLOBAL = "ResizeObserver";

/**
 * jsdom implements no layout, and therefore no `ResizeObserver` — but the app
 * has two of them (`usePromptAutosize` in the composer, and any virtualiser
 * that measures items), and a bare `new ResizeObserver(...)` is a ReferenceError
 * that kills the render rather than degrading it.
 *
 * The stub observes nothing and never fires, which is the honest behaviour for
 * an environment where nothing ever has a size: a test that needs a size sets
 * it explicitly. It lives here rather than in each test file for the same
 * reason the localStorage shim does — a missing global is the environment's
 * problem, not each case's.
 */
if ((globalThis as Record<string, unknown>)[RESIZE_OBSERVER_GLOBAL] === undefined) {
  Object.defineProperty(globalThis, RESIZE_OBSERVER_GLOBAL, {
    value: class {
      observe(): void {
        // Nothing in jsdom ever changes size.
      }
      unobserve(): void {
        // Nothing was observed.
      }
      disconnect(): void {
        // Nothing to disconnect.
      }
    },
    configurable: true,
    writable: true,
  });
}
