import type { CaptureTone } from "@/components/CaptureMeter";
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

interface Presentation {
  tone: CaptureTone;
  animated: boolean;
  word: string;
  /** What a screen reader is told, which needs more than the on-screen word. */
  announcement: string;
}

const PRESENTATION: Record<ListeningState, Presentation> = {
  recording: {
    tone: "listening",
    animated: true,
    word: "Пишу",
    announcement: "Идёт запись системного звука",
  },
  auto: {
    tone: "listening",
    animated: true,
    word: "Слушаю",
    announcement: "Автослушание включено, звук пишется",
  },
  armed: {
    tone: "armed",
    animated: false,
    word: "Наготове",
    announcement: "Фоновый буфер держит последние секунды звука",
  },
  transcribing: {
    tone: "processing",
    animated: true,
    word: "Распознаю",
    announcement: "Распознаю речь",
  },
  off: { tone: "idle", animated: false, word: "Не слушает", announcement: "Ничего не пишется" },
  error: { tone: "danger", animated: false, word: "Ошибка", announcement: "Ошибка" },
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

export function listeningAnnouncement(value: ListeningState): string {
  return PRESENTATION[value].announcement;
}

export function listeningPresentation(value: ListeningState): Presentation {
  return PRESENTATION[value];
}
