import type { PermissionKind } from "@/ipc/types";

/**
 * The settings form's copy — the shared feature both the launcher's «Настройки»
 * screen and onboarding render.
 *
 * Every record here is keyed by an id that already exists in a registry
 * (`settings-tabs.ts`, `settings-registry.ts`, `permission-rows.ts`), which is
 * what makes the dictionary exhaustive: adding a row without a translation is a
 * `tsc` failure, and that is the whole reason the labels left those registries
 * instead of gaining a second copy beside them.
 */
export type SettingsTabKey =
  "access" | "speech" | "hotkeys" | "quick-actions" | "window" | "behavior" | "appearance";

export type SettingsGroupKey = "stt" | "auto-mode" | "behavior" | "appearance";

export type SettingsEntryKey =
  | "capture_device_uid"
  | "stt_language"
  | "stt_translate"
  | "buffer_enabled"
  | "buffer_seconds"
  | "auto_mode_enabled"
  | "auto_reply_instant"
  | "auto_mic_device_uid"
  | "auto_silence_ms"
  | "auto_min_utterance_ms"
  | "auto_max_utterance_secs"
  | "screen_share_visible"
  | "auto_send"
  | "copy_results_to_clipboard"
  | "auto_preview_html"
  | "teleprompter_resume"
  | "theme"
  | "language"
  | "chat_font_size"
  | "window_opacity"
  | "quick_action_attachments";

/**
 * Option labels that are NOT proper names. The endonyms — «Русский», English,
 * Українська — stay in the registry as fixed text: a language's name in its own
 * language is the same string in every dictionary, and translating "English"
 * into Russian would make the picker say what the option is not.
 */
export type OptionLabelKey =
  "sttAuto" | "themeSystem" | "themeLight" | "themeDark" | "languageSystem";

/** The unit a bounded number is read out in, beside its slider. */
export type ReadoutKey = "seconds" | "milliseconds" | "pixels" | "percent";

export type PermissionNeedKey = "launch" | "auto-mode" | "optional";

export interface LabelledCopy {
  label: string;
  hint: string;
}

export interface SettingsCopy {
  tabs: Record<SettingsTabKey, { label: string; description: string }>;
  groups: Record<SettingsGroupKey, { title: string; description: string }>;
  entries: Record<SettingsEntryKey, LabelledCopy>;
  optionLabels: Record<OptionLabelKey, string>;
  /** `{value}` — the number; the unit is what differs between locales. */
  readouts: Record<ReadoutKey, string>;
  devices: {
    systemOutput: string;
    systemMicrophone: string;
    missing: string;
  };
  /** Replaces a row's hint while the row is greyed out, and says why. */
  disabledHints: { sttLanguageWhileTranslating: string };
  permissions: {
    rows: Record<PermissionKind, { title: string; purpose: string }>;
    needs: Record<PermissionNeedKey, string>;
    grant: string;
    requesting: string;
    openSettings: string;
  };
  apiKeys: {
    accessCodeActiveDescription: string;
    accessCodeActiveLabel: string;
    accessCodeActiveHint: string;
    unlink: string;
    description: string;
    accessCodeLabel: string;
    accessCodeHint: string;
    /** `{name}` — Anthropic or Groq. */
    keyLabel: string;
    /** `{purpose}` */
    keyPurpose: string;
    /** `{purpose}` and `{mask}` */
    keyPurposeStored: string;
    saveKey: string;
    clearKey: string;
    consoleKey: string;
    replayLabel: string;
    replayHint: string;
    replay: string;
  };
}
