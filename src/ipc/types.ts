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
  auto_preview_html: boolean;
  toggle_hotkey: string;
}

export const DEFAULT_SETTINGS: Settings = {
  anthropic_api_key: "",
  groq_api_key: "",
  model: "claude-opus-4-8",
  system_prompt: "",
  hotkey: "F9",
  auto_send: false,
  window_opacity: 1,
  move_step: 20,
  auto_preview_html: true,
  toggle_hotkey: "Cmd+Shift+H",
};

export const MODELS = ["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5"] as const;

export type RecorderState = "idle" | "recording" | "transcribing";

/** DTO сообщения для отправки в Anthropic (соответствует Rust llm::ChatMessage). */
export interface ChatMessageDto {
  role: "user" | "assistant";
  text: string;
  images: ImagePayload[];
}

/** Карта имя-события → тип payload (для типобезопасного listen). */
export interface EventMap {
  "state-changed": RecorderState;
  "transcript-ready": string;
  "stt-error": string;
  "llm-delta": { chatId: string; delta: string };
  "llm-done": { chatId: string };
  "llm-error": { chatId: string; message: string };
}
