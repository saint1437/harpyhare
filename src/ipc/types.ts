import type { ImagePayload } from "@/lib/composer";
import { type PromptPreset, TRANSCRIPTION_PRESET_ID } from "@/lib/presets";

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
  /** Anthropic fast mode (research preview): до ~2.5x токенов/сек на opus-4-8, дороже. */
  fast_mode: boolean;
  /** Размер шрифта чата, px (модель — свойство чата, см. lib/models). */
  chat_font_size: number;
  /** «Пропущенная» версия обновления: автобейдж о ней не показывается ("" — нет). */
  skipped_version: string;
  /** Язык распознавания Whisper (ISO 639-1, напр. "ru"); "" — автоопределение. */
  stt_language: string;
  /** Переводить речь на английский (эндпоинт translations вместо transcriptions). */
  stt_translate: boolean;
  /** Показывать окно при демонстрации экрана (снимает contentProtected). */
  screen_share_visible: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  anthropic_api_key: "",
  groq_api_key: "",
  prompt_presets: [{ id: TRANSCRIPTION_PRESET_ID, name: "Расшифровка речи", text: "" }],
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
};

export type RecorderState = "idle" | "recording" | "transcribing";

/** DTO сообщения для отправки в Anthropic (соответствует Rust llm::ChatMessage). */
export interface ChatMessageDto {
  role: "user" | "assistant";
  text: string;
  images: ImagePayload[];
}

/** Найденное обновление (Rust update::UpdateInfo). */
export interface UpdateInfo {
  version: string;
  notes: string;
  date: string | null;
}

/** Прогресс загрузки обновления; total неизвестен без Content-Length. */
export interface UpdateProgress {
  downloaded: number;
  total: number | null;
}

/** Карта имя-события → тип payload (для типобезопасного listen). */
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
}
