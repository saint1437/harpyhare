/** Вне Tauri (обычный браузер для визуальной проверки) invoke/listen недоступны. */
export const isTauri = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
