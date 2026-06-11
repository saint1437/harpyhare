import { listen } from "@tauri-apps/api/event";
import { isTauri } from "./env";
import type { EventMap } from "./types";

export type Unlisten = () => void;

/**
 * Подписка на событие Rust. Возвращает функцию отписки.
 * В браузере (не Tauri) — no-op с пустой отпиской.
 */
export function onEvent<K extends keyof EventMap>(
  name: K,
  handler: (payload: EventMap[K]) => void,
): Unlisten {
  if (!isTauri())
    return () => {
      /* no-op в браузере */
    };
  let live = true;
  let off: Unlisten = () => {
    /* no-op до резолва listen */
  };
  void listen<EventMap[K]>(name, (e) => {
    handler(e.payload);
  }).then((un) => {
    if (live) off = un;
    else un();
  });
  return () => {
    live = false;
    off();
  };
}
