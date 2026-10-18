import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { EventMap } from "./types";

export type Unlisten = () => void;

const noopUnlisten: Unlisten = () => undefined;

export interface LogicalWindowSize {
  width: number;
  height: number;
}

export type FileDropEvent =
  | { type: "over"; x: number; y: number }
  | { type: "drop"; paths: string[]; x: number; y: number }
  | { type: "leave" };

export function onFileDrop(handler: (event: FileDropEvent) => void): Unlisten {
  let live = true;
  let off: Unlisten = noopUnlisten;
  const scale = window.devicePixelRatio || 1;
  void getCurrentWebview()
    .onDragDropEvent((event) => {
      if (!live) return;
      const payload = event.payload;
      if (payload.type === "over") {
        handler({ type: "over", x: payload.position.x / scale, y: payload.position.y / scale });
      } else if (payload.type === "drop") {
        handler({
          type: "drop",
          paths: payload.paths,
          x: payload.position.x / scale,
          y: payload.position.y / scale,
        });
      } else {
        handler({ type: "leave" });
      }
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

/**
 * Native logical pixels use the OS scale, not `devicePixelRatio`: WebView2
 * includes browser zoom in the latter. Cache `scaleFactor()` once and update
 * it on monitor/DPI changes, rather than invoking on every resize pixel.
 */
export function onWindowResized(handler: (size: LogicalWindowSize) => void): Unlisten {
  let live = true;
  let offResize: Unlisten = noopUnlisten;
  let offScale: Unlisten = noopUnlisten;
  let scale: number | null = null;
  let pending: LogicalWindowSize | null = null;
  const win = getCurrentWindow();
  const deliver = (size: LogicalWindowSize) => {
    if (!live) return;
    if (scale === null) {
      pending = size;
      return;
    }
    pending = null;
    handler({ width: size.width / scale, height: size.height / scale });
  };
  void win
    .onScaleChanged(({ payload }) => {
      if (!live) return;
      scale = payload.scaleFactor;
      deliver(payload.size);
    })
    .then((unlisten) => {
      if (live) offScale = unlisten;
      else unlisten();
    });
  void win
    .onResized(({ payload }) => {
      deliver(payload);
    })
    .then((unlisten) => {
      if (live) offResize = unlisten;
      else unlisten();
    });
  void win.scaleFactor().then((initialScale) => {
    if (!live) return;
    // A DPI event may already have arrived while this initial read was pending.
    scale ??= initialScale;
    if (pending !== null) deliver(pending);
  });
  return () => {
    live = false;
    offResize();
    offScale();
  };
}

export function onEvent<K extends keyof EventMap>(
  name: K,
  handler: (payload: EventMap[K]) => void,
): Unlisten {
  let live = true;
  let off: Unlisten = noopUnlisten;
  void listen<EventMap[K]>(name, (e) => {
    if (!live) return;
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
