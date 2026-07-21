import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "./env";
import type { EventMap } from "./types";

export type Unlisten = () => void;

const noopUnlisten: Unlisten = () => undefined;

export interface LogicalWindowSize {
  width: number;
  height: number;
}

export function onWindowResized(handler: (size: LogicalWindowSize) => void): Unlisten {
  if (!isTauri()) return noopUnlisten;
  let live = true;
  let off: Unlisten = noopUnlisten;
  const win = getCurrentWindow();
  void win
    .onResized(({ payload }) => {
      void win.scaleFactor().then((scale) => {
        if (!live) return;
        handler({ width: payload.width / scale, height: payload.height / scale });
      });
    })
    .then((unlisten) => {
      if (live) off = unlisten;
      else unlisten();
    });
  return () => {
    live = false;
    off();
  };
}

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
