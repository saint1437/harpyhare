import { useSyncExternalStore } from "react";

/**
 * The stream slice — the one piece of app state that changes SIXTY TIMES A
 * SECOND, and therefore the one that must not live in the root component.
 *
 * `useClaudeStream` reveals the answer in a rAF loop (`lib/stream-reveal`), and
 * while `partial` was a `useState` in `App` every one of those frames re-rendered
 * the entire tree: the header, the chat tabs, the composer, the quick actions,
 * the status bar — everything, to change one string inside one panel. Now the
 * text lives here and exactly one subscriber reads it (`LiveAnswerPanel`), while
 * `App` subscribes only to the flags, which change twice per answer.
 *
 * The pattern is the app's own (`lib/notifications` + `hooks/useNotifications`):
 * a module singleton plus `useSyncExternalStore`, no new dependency. Module
 * scope IS per-window state here — the two windows are two React roots that
 * share nothing — and the HUD is the only window that streams.
 *
 * Every mutator returns without emitting when nothing actually changed: a
 * snapshot that is a fresh object every call makes `useSyncExternalStore` loop
 * forever, and an equal-but-new record would wake every subscriber per frame.
 */

export interface StreamState {
  /** The revealed prefix of the answer, per chat. */
  partial: Record<string, string>;
  streaming: Record<string, boolean>;
  /** When the request went out — the thinking indicator counts from it. */
  startedAt: Record<string, number>;
}

const EMPTY_STATE: StreamState = { partial: {}, streaming: {}, startedAt: {} };

let state: StreamState = EMPTY_STATE;

const listeners = new Set<() => void>();

function emit(next: StreamState): void {
  state = next;
  listeners.forEach((listener) => {
    listener();
  });
}

export function subscribeStream(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getStreamState(): StreamState {
  return state;
}

/** Only for tests: module scope outlives a `cleanup()` between cases. */
export function resetStreamState(): void {
  state = EMPTY_STATE;
}

/**
 * One frame of the reveal loop, for every live stream at once: a chat whose
 * revealed text did not grow this frame must not wake its subscriber.
 */
export function setPartials(updates: Record<string, string>): void {
  let changed = false;
  const partial = { ...state.partial };
  for (const [chatId, text] of Object.entries(updates)) {
    if (partial[chatId] !== text) {
      partial[chatId] = text;
      changed = true;
    }
  }
  if (!changed) return;
  emit({ ...state, partial });
}

export function clearPartial(chatId: string): void {
  if (!(chatId in state.partial)) return;
  const { [chatId]: _omit, ...partial } = state.partial;
  emit({ ...state, partial });
}

export function beginStreamState(chatId: string, at: number): void {
  emit({
    partial: { ...state.partial, [chatId]: "" },
    streaming: { ...state.streaming, [chatId]: true },
    startedAt: { ...state.startedAt, [chatId]: at },
  });
}

export function setStreamingFlag(chatId: string, on: boolean): void {
  if ((state.streaming[chatId] ?? false) === on) return;
  emit({ ...state, streaming: { ...state.streaming, [chatId]: on } });
}

/** The busy check outside React — the send pipeline runs from event handlers. */
export function isStreaming(chatId: string): boolean {
  return state.streaming[chatId] === true;
}

export function useStreamPartial(chatId: string): string {
  return useSyncExternalStore(subscribeStream, () => state.partial[chatId] ?? "");
}

export function useIsStreaming(chatId: string): boolean {
  return useSyncExternalStore(subscribeStream, () => state.streaming[chatId] === true);
}

export function useStreamStartedAt(chatId: string): number | undefined {
  return useSyncExternalStore(subscribeStream, () => state.startedAt[chatId]);
}

/** The busy dot on every chat tab; the record identity changes only on a real change. */
export function useStreamingFlags(): Record<string, boolean> {
  return useSyncExternalStore(subscribeStream, () => state.streaming);
}

/**
 * Whether there is any revealed text yet — the ONE thing the root needs to know
 * about the answer's content ("can the teleprompter be opened"). It flips once
 * per answer instead of once per frame, which is the whole point of not handing
 * the root the text itself.
 */
export function useStreamHasText(chatId: string): boolean {
  return useSyncExternalStore(subscribeStream, () => (state.partial[chatId] ?? "") !== "");
}
