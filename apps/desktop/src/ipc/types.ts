import type { ImagePayload } from "@/lib/composer";
import type { AppError } from "@/lib/errors";
import type { PromptPreset } from "@/lib/presets";
import { SETTINGS_DEFAULTS } from "./bindings";

export type { AppError, ImagePayload };

export interface HotkeyBinding {
  action: string;
  combo: string;
}

export interface QuickAction {
  id: string;
  title: string;
  prompt: string;
}

export interface Settings {
  anthropic_api_key: string;
  groq_api_key: string;
  access_token: string;
  prompt_presets: PromptPreset[];
  hotkeys: HotkeyBinding[];
  auto_send: boolean;
  window_opacity: number;
  move_step: number;
  auto_preview_html: boolean;
  chat_font_size: number;
  skipped_version: string;
  stt_language: string;
  stt_translate: boolean;
  screen_share_visible: boolean;
  teleprompter_speed: number;
  teleprompter_font_size: number;
  teleprompter_resume: boolean;
  audio_permission_requested: boolean;
  screen_permission_requested: boolean;
  window_width: number;
  window_height: number;
  resize_step: number;
  capture_device_uid: string;
  theme: string;
  onboarding_done: boolean;
  copy_results_to_clipboard: boolean;
  scroll_step: number;
  buffer_enabled: boolean;
  buffer_seconds: number;
  auto_mode_enabled: boolean;
  auto_reply_instant: boolean;
  auto_mic_device_uid: string;
  auto_silence_ms: number;
  auto_min_utterance_ms: number;
  auto_max_utterance_secs: number;
  mic_permission_requested: boolean;
  quick_actions: QuickAction[];
  quick_action_attachments: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  ...SETTINGS_DEFAULTS,
  prompt_presets: [...SETTINGS_DEFAULTS.prompt_presets],
  hotkeys: [...SETTINGS_DEFAULTS.hotkeys],
  quick_actions: [...SETTINGS_DEFAULTS.quick_actions],
};

export interface AudioDeviceInfo {
  uid: string;
  name: string;
}

export type Speaker = "interviewer" | "user";

export interface AutoTurn {
  speaker: Speaker;
  text: string;
  seq: number;
}

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
  "stt-error": AppError;
  "llm-delta": { chatId: string; delta: string };
  "llm-done": { chatId: string };
  "llm-error": AppError & { chatId: string };
  "llm-usage": { chatId: string; inputTokens: number };
  "update-available": UpdateInfo;
  "update-progress": UpdateProgress;
  "update-done": { version: string };
  "toggle-teleprompter": null;
  "resize-key": { dim: "width" | "height"; dir: 1 | -1 };
  "official-presets-updated": PromptPreset[];
  "screenshot-ready": { mediaType: string; dataBase64: string };
  "screenshot-error": AppError;
  "focus-prompt": null;
  "auto-turn": AutoTurn;
  "auto-mode-changed": { active: boolean };
  "auto-mode-error": AppError;
  "auto-answer": null;
  "collapsed-changed": { collapsed: boolean };
  "audio-level": { level: number };
}
