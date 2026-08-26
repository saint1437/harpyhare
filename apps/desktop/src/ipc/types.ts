import type { ImagePayload } from "@/lib/composer";
import type { AppError } from "@/lib/errors";
import type { PromptPreset } from "@/lib/presets";
import { SECRETS_STATUS_DEFAULTS, SETTINGS_DEFAULTS } from "./bindings";

export type { AppError, ImagePayload };

// The generated artefact is reached through this module only: `bindings.ts` is
// rewritten by `cargo test` and is excluded from eslint/prettier/knip, so the
// rest of the app (including framework-free `lib/`) depends on this facade
// instead of on the generator's output.
export {
  HOTKEY_ACTIONS,
  MODIFIER_COMBOS,
  QUICK_ACTION_LIMIT,
  SECRETS_STATUS_DEFAULTS,
  SETTINGS_DEFAULTS,
  SETTINGS_LIMITS,
} from "./bindings";
export type {
  ApiKeyKind,
  AudioCheck,
  AudioSource,
  HotkeyKind,
  PermissionKind,
  PermissionState,
  PermissionsStatus,
} from "./bindings";

export interface HotkeyBinding {
  action: string;
  combo: string;
}

export interface QuickAction {
  id: string;
  title: string;
  prompt: string;
}

/**
 * What `get_settings` returns — and, since the security audit, **a type with no
 * secret in it**. The two API keys and the access token used to be three plain
 * strings here and reached the webview on every call; they live in Rust now,
 * and the frontend sees only {@link SecretsStatus}.
 */
export interface Settings {
  /** The on-disk format of settings.json; owned by Rust's migration chain. */
  schema_version: number;
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
  /** `"system" | "ru" | "en"`; `system` is resolved on the frontend — see `@/i18n`. */
  language: string;
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

/**
 * Everything the frontend is allowed to know about the credentials: whether each
 * one is stored, and a masked tail to tell two keys apart. It arrives through
 * its own command (`get_secrets_status`) and is never part of a settings draft —
 * the values are written by `set_api_key`/`clear_api_key` alone.
 */
export interface SecretsStatus {
  anthropic_key_set: boolean;
  groq_key_set: boolean;
  access_code_active: boolean;
  /** `sk-…9f2a`, or `""` when no key is stored. */
  anthropic_key_hint: string;
  groq_key_hint: string;
}

export const DEFAULT_SECRETS_STATUS: SecretsStatus = { ...SECRETS_STATUS_DEFAULTS };

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
