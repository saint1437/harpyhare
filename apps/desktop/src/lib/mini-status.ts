import type { RecorderState } from "@/ipc/types";

export type MiniStatus = "recording" | "transcribing" | "streaming" | "error" | "unread" | "idle";

export function miniStatus(
  state: RecorderState,
  streaming: boolean,
  hasError: boolean,
  unreadAnswer: boolean,
): MiniStatus {
  if (state === "recording") return "recording";
  if (state === "transcribing") return "transcribing";
  if (streaming) return "streaming";
  if (hasError) return "error";
  if (unreadAnswer) return "unread";
  return "idle";
}

export function isActivityStatus(state: RecorderState, streaming: boolean): boolean {
  return state === "recording" || state === "transcribing" || streaming;
}
