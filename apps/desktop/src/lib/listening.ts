import type { RecorderState } from "@/ipc/types";

/**
 * The HUD's answer to "is it listening?".
 *
 * The recorder FSM has three states, but capture has five, because the ring
 * buffer is orthogonal to it and was previously invisible: `buffer_enabled`
 * defaults to true and starts with the HUD, so an idle window with the buffer
 * running rendered EXACTLY like an idle window that could not hear a thing. Its
 * only control lived in the launcher, which has to be destroyed to reach.
 *
 * Every state carries a word as well as a colour, because the five bars are
 * `aria-hidden` decoration and `prefers-reduced-motion` stops them moving.
 */
export type ListeningState = "recording" | "transcribing" | "auto" | "armed" | "off" | "error";

/**
 * The five bars of `CaptureMeter` mean ONE thing: sound is being captured, or was
 * about to be.
 *
 * They used to be two components in one — the launcher's brand mark and the HUD's
 * capture indicator — separated only by which red filled them. The brand half is
 * `Wordmark`; this half never leaves the capture vocabulary.
 */
export type CaptureTone = "listening" | "armed" | "processing" | "danger" | "idle";

/**
 * How loudly the state's word is printed. A colour would put a Tailwind class in
 * a framework-free module; the component owns the class, this owns the meaning —
 * and being a field of `Presentation` makes it exhaustive, so a sixth state
 * cannot silently inherit the neutral tone.
 */
export type WordEmphasis = "normal" | "muted" | "danger";

/**
 * What a state LOOKS like — and nothing about what it is called. The word and
 * the announcement moved into `dict.common.listening`, keyed by the same state,
 * so the two locales cannot disagree on the vocabulary while this file keeps
 * the one thing that is not language: the colour, the motion and the emphasis.
 */
interface Presentation {
  tone: CaptureTone;
  animated: boolean;
  emphasis: WordEmphasis;
}

const PRESENTATION: Record<ListeningState, Presentation> = {
  recording: { tone: "listening", animated: true, emphasis: "normal" },
  auto: { tone: "listening", animated: true, emphasis: "normal" },
  armed: { tone: "armed", animated: false, emphasis: "normal" },
  transcribing: { tone: "processing", animated: true, emphasis: "normal" },
  off: { tone: "idle", animated: false, emphasis: "muted" },
  error: { tone: "danger", animated: false, emphasis: "danger" },
};

export function listeningState({
  state,
  autoListening,
  bufferEnabled,
  hasError,
}: {
  state: RecorderState;
  autoListening: boolean;
  bufferEnabled: boolean;
  hasError: boolean;
}): ListeningState {
  if (state === "recording") return "recording";
  if (state === "transcribing") return "transcribing";
  if (autoListening) return "auto";
  if (hasError) return "error";
  return bufferEnabled ? "armed" : "off";
}

export function listeningPresentation(value: ListeningState): Presentation {
  return PRESENTATION[value];
}
