import type { OrbState } from "@/components/Orb";
import type { RecorderState } from "@/ipc/types";
import { listeningState } from "./listening";

/**
 * What the ball says while the window is collapsed.
 *
 * Order matters and is a product statement: capture outranks everything, because
 * "am I being heard right now" is the only question a collapsed window must
 * never get wrong. A finished-but-unread answer outranks idle, so the ball can
 * call you back; an error outranks idle for the same reason.
 */
export function orbState(input: {
  state: RecorderState;
  autoListening: boolean;
  bufferEnabled: boolean;
  hasError: boolean;
  streaming: boolean;
  answerReady: boolean;
}): OrbState {
  const listening = listeningState(input);
  if (listening === "recording" || listening === "auto" || listening === "transcribing") {
    return listening;
  }
  if (input.streaming) return "transcribing";
  if (input.answerReady) return "answer";
  return listening;
}
