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
