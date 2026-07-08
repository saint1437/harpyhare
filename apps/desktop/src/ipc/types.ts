import type { ImagePayload } from "@/lib/composer";
import type { PromptPreset } from "@/lib/presets";

export type { ImagePayload };
export type { PromptPreset };

export interface Settings {
  anthropic_api_key: string;
  groq_api_key: string;
  prompt_presets: PromptPreset[];
  hotkey: string;
  auto_send: boolean;
  window_opacity: number;
  move_step: number;
  auto_preview_html: boolean;
  toggle_hotkey: string;
  fast_mode: boolean;
  chat_font_size: number;
  skipped_version: string;
  stt_language: string;
  stt_translate: boolean;
  screen_share_visible: boolean;
  teleprompter_speed: number;
  teleprompter_font_size: number;
  teleprompter_hotkey: string;
  teleprompter_resume: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  anthropic_api_key: "",
  groq_api_key: "",
  prompt_presets: [],
  hotkey: "F9",
  auto_send: false,
  window_opacity: 0.9,
  move_step: 20,
  auto_preview_html: true,
  toggle_hotkey: "Cmd+Shift+H",
  fast_mode: false,
  chat_font_size: 13.5,
  skipped_version: "",
  stt_language: "ru",
  stt_translate: false,
  screen_share_visible: false,
  teleprompter_speed: 40,
  teleprompter_font_size: 28,
  teleprompter_hotkey: "F10",
  teleprompter_resume: true,
};

export type RecorderState = "idle" | "recording" | "transcribing";

export interface ChatMessageDto {
  role: "user" | "assistant";
  text: string;
  images: ImagePayload[];
}

export interface UpdateInfo {
  version: string;
  notes: string;
  date: string | null;
}

export interface UpdateProgress {
  downloaded: number;
  total: number | null;
}

export interface EventMap {
  "state-changed": RecorderState;
  "transcript-ready": string;
  "stt-error": string;
  "llm-delta": { chatId: string; delta: string };
  "llm-done": { chatId: string };
  "llm-error": { chatId: string; message: string };
  "update-available": UpdateInfo;
  "update-progress": UpdateProgress;
  "update-done": { version: string };
  "toggle-teleprompter": null;
  "official-presets-updated": PromptPreset[];
}
