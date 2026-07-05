const TAURI_INTERNALS_KEY = "__TAURI_INTERNALS__";

export const isTauri = (): boolean =>
  typeof window !== "undefined" && TAURI_INTERNALS_KEY in window;
