import { act } from "@testing-library/react";

type Handler = (payload: never) => void;

/**
 * The onEvent fake shared by hook tests — a handlers map plus an act()-wrapped
 * emit. Five test files each carried a byte-identical copy of this harness.
 *
 * Wire it up with the hoisting-safe form:
 *   vi.mock("@/ipc/events", async () => await import("@/test-utils/fake-ipc-events"));
 * then import { emitIpcEvent, ipcEventHandlers } here and clear the map in
 * afterEach via resetIpcEventHandlers().
 */
export const ipcEventHandlers = new Map<string, Handler>();

export function onEvent(name: string, handler: Handler): () => void {
  ipcEventHandlers.set(name, handler);
  return () => {
    ipcEventHandlers.delete(name);
  };
}

export function emitIpcEvent(name: string, payload: unknown): void {
  act(() => ipcEventHandlers.get(name)?.(payload as never));
}

export function resetIpcEventHandlers(): void {
  ipcEventHandlers.clear();
}
