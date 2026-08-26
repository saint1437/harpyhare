import type { RecorderState } from "@/ipc/types";
import { listeningState, type ListeningState } from "./listening";

/** The collapsed ball shows every listening state plus "an answer is waiting". */
export type OrbState = ListeningState | "answer";

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

/** Что делать с клубком, когда дописан ответ. */
export type AnswerArrival = "expand" | "notify" | "ignore";

/**
 * Разворачивает только ответ в АКТИВНОМ чате: чаты идут параллельно, и
 * развернуться на чат, где ничего не изменилось, значит соврать. Ответ в фоновом
 * чате зовёт точкой на клубке и ждёт, пока на него переключатся.
 */
export function answerArrival(input: {
  collapsed: boolean;
  chatId: string;
  activeChatId: string;
}): AnswerArrival {
  if (!input.collapsed) return "ignore";
  return input.chatId === input.activeChatId ? "expand" : "notify";
}

/**
 * Расшифровка, которая не уйдёт сама, ждёт человека — а поля ввода у клубка
 * не видно вовсе. Записать вопрос и не увидеть ничего — это потерянная работа,
 * поэтому такой случай разворачивает окно.
 *
 * При включённой автоотправке разворачивать нечего: вопрос уходит сам, и окно
 * раскроется на готовом ответе. Дёргать его дважды незачем.
 */
export function transcriptArrival(input: {
  collapsed: boolean;
  autoSend: boolean;
}): "expand" | "ignore" {
  return input.collapsed && !input.autoSend ? "expand" : "ignore";
}
