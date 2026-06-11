import type { ImagePayload } from "@/lib/composer";

export type { ImagePayload };

export interface Settings {
  anthropic_api_key: string;
  groq_api_key: string;
  model: string;
  system_prompt: string;
  hotkey: string;
  auto_send: boolean;
  window_opacity: number;
  move_step: number;
}

export const DEFAULT_SETTINGS: Settings = {
  anthropic_api_key: "",
  groq_api_key: "",
  model: "claude-opus-4-8",
  system_prompt: "",
  hotkey: "V",
  auto_send: false,
  window_opacity: 1,
  move_step: 20,
};

export const MODELS = ["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5"] as const;

export type RecorderState = "idle" | "recording" | "transcribing";

/** Карта имя-события → тип payload (для типобезопасного listen). */
export interface EventMap {
  "state-changed": RecorderState;
  "transcript-ready": string;
  "stt-error": string;
  "llm-delta": string;
  "llm-done": void;
  "llm-error": string;
}
