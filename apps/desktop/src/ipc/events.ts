import { listen } from "@tauri-apps/api/event";
import { isTauri } from "./env";
import type { EventMap } from "./types";

export type Unlisten = () => void;

const noopUnlisten: Unlisten = () => undefined;

export function onEvent<K extends keyof EventMap>(
  name: K,
  handler: (payload: EventMap[K]) => void,
): Unlisten {
  if (!isTauri()) return noopUnlisten;
  let live = true;
  let off: Unlisten = noopUnlisten;
  void listen<EventMap[K]>(name, (e) => {
    handler(e.payload);
  }).then((unlisten) => {
    if (live) off = unlisten;
    else unlisten();
  });
  return () => {
    live = false;
    off();
  };
}
