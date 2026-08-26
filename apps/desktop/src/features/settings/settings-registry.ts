import { applyLanguage, LANGUAGES } from "@/i18n";
import type {
  OptionLabelKey,
  ReadoutKey,
  SettingsEntryKey,
  SettingsGroupKey,
} from "@/i18n/settings-types";
import type { Settings } from "@/ipc/types";
import { SETTINGS_LIMITS } from "@/ipc/types";
import { applyTheme, THEMES, type Theme } from "@/lib/window-controls";
import type { SettingsTabId } from "./settings-tabs";

/**
 * Every ordinary settings row, once.
 *
 * The launcher's search index used to hold a hand-typed copy of these labels and
 * hints — 23 entries, word for word identical to the props the sections passed
 * to `SettingRow`. Hotkeys, screens, tabs and permissions were all indexed from
 * their registries; only the plain settings had a second, silently drifting
 * source. Rewording a row on screen left search matching a sentence nobody could
 * read any more.
 *
 * What is NOT here either, since the app went bilingual: a word of text. Every
 * label, hint, group title and option name is `dict.settings`, keyed by the ids
 * below — which is the same single-source argument one step further on. The
 * registry keeps what a dictionary cannot: the `Settings` key, the bounds, the
 * step, the dependency on another switch.
 *
 * What is NOT here: rows whose control is a thing of its own rather than a value
 * — the API-key fields, the hotkey table, the quick-action list, the presets
 * editor, the modifier+step pairs (`window-pairs.ts`). Those keep their own
 * registries and their own rendering; this one covers exactly the switches,
 * sliders, selects and device pickers.
 */

type SettingKeyOfType<T> = {
  [K in keyof Settings]: Settings[K] extends T ? K : never;
}[keyof Settings];

export type BooleanSettingKey = SettingKeyOfType<boolean>;
export type NumberSettingKey = SettingKeyOfType<number>;
export type StringSettingKey = SettingKeyOfType<string>;

interface Bounds {
  readonly min: number;
  readonly max: number;
}

/**
 * An option carries EITHER a fixed `label` or a `labelKey`, and which one says
 * something: the language endonyms («Русский», English, Українська) are proper
 * names — the same string in every dictionary, and translating "English" into
 * Russian would make the picker say what the option is not. Everything else
 * («Автоопределение», the theme names) is a phrase and goes through the key.
 */
export type SelectOption =
  | { value: string; label: string; labelKey?: never }
  | { value: string; labelKey: OptionLabelKey; label?: never };

export type SettingField =
  | { kind: "switch"; key: BooleanSettingKey }
  | {
      kind: "slider";
      key: NumberSettingKey;
      limits: Bounds;
      step: number;
      /** The unit beside the slider; a bounded number is never a bare input. */
      readout: ReadoutKey;
      /** The row greys out while this switch is off (the buffer depth, for one). */
      enabledBy?: BooleanSettingKey;
    }
  | {
      kind: "select";
      key: StringSettingKey;
      options: readonly SelectOption[];
      /** The option that stands for an empty stored value ("" = auto/default). */
      emptyValue?: string;
      /** The row greys out while this switch is ON, and says so. */
      disabledBy?: BooleanSettingKey;
      /** Which sentence of `dict.settings.disabledHints` replaces the hint then. */
      disabledHint?: keyof import("@/i18n/settings-types").SettingsCopy["disabledHints"];
      /** Applied to the live document as well as to the draft (theme preview). */
      apply?: (value: string) => void;
    }
  | {
      kind: "device";
      key: StringSettingKey;
      /** Which entry of `dict.settings.devices` stands for "the system default". */
      defaultLabel: "systemOutput" | "systemMicrophone";
      /** Which capture side to list; the commands live in the renderer, not here. */
      source: "output" | "input";
    };

export interface SettingsGroupMeta {
  id: SettingsGroupKey;
  tab: SettingsTabId;
}

export interface SettingsEntry {
  id: SettingsEntryKey;
  tab: SettingsTabId;
  /**
   * The card the row is rendered in, or `null` when the section owns the card
   * itself (the quick-action switch sits inside the quick-action editor).
   */
  group: SettingsGroupKey | null;
  field: SettingField;
}

export const SETTINGS_GROUPS = [
  { id: "stt", tab: "speech" },
  { id: "auto-mode", tab: "speech" },
  { id: "behavior", tab: "behavior" },
  { id: "appearance", tab: "appearance" },
] as const satisfies readonly SettingsGroupMeta[];

const STT_LANGUAGE_AUTO = "auto";

const STT_LANGUAGES: readonly SelectOption[] = [
  { value: "ru", label: "Русский" },
  { value: "en", label: "English" },
  { value: "uk", label: "Українська" },
  { value: "de", label: "Deutsch" },
  { value: "es", label: "Español" },
  { value: "fr", label: "Français" },
  { value: STT_LANGUAGE_AUTO, labelKey: "sttAuto" },
];

const THEME_LABEL_KEY: Record<Theme, OptionLabelKey> = {
  system: "themeSystem",
  light: "themeLight",
  dark: "themeDark",
};

const THEME_OPTIONS: readonly SelectOption[] = THEMES.map((theme) => ({
  value: theme,
  labelKey: THEME_LABEL_KEY[theme],
}));

/**
 * `system` is a phrase and takes a key; the other two are endonyms and are the
 * same word in both dictionaries — a language picker that renamed "English" per
 * locale would be telling the reader the opposite of what the option does.
 */
const LANGUAGE_OPTIONS: readonly SelectOption[] = [
  { value: LANGUAGES[0], labelKey: "languageSystem" },
  { value: "ru", label: "Русский" },
  { value: "en", label: "English" },
];

export const SETTINGS_ENTRIES = [
  {
    id: "capture_device_uid",
    tab: "speech",
    group: "stt",
    field: {
      kind: "device",
      key: "capture_device_uid",
      defaultLabel: "systemOutput",
      source: "output",
    },
  },
  {
    id: "stt_language",
    tab: "speech",
    group: "stt",
    field: {
      kind: "select",
      key: "stt_language",
      options: STT_LANGUAGES,
      emptyValue: STT_LANGUAGE_AUTO,
      disabledBy: "stt_translate",
      disabledHint: "sttLanguageWhileTranslating",
    },
  },
  {
    id: "stt_translate",
    tab: "speech",
    group: "stt",
    field: { kind: "switch", key: "stt_translate" },
  },
  {
    id: "buffer_enabled",
    tab: "speech",
    group: "stt",
    field: { kind: "switch", key: "buffer_enabled" },
  },
  {
    id: "buffer_seconds",
    tab: "speech",
    group: "stt",
    field: {
      kind: "slider",
      key: "buffer_seconds",
      limits: SETTINGS_LIMITS.bufferSeconds,
      step: 1,
      readout: "seconds",
      enabledBy: "buffer_enabled",
    },
  },

  {
    id: "auto_mode_enabled",
    tab: "speech",
    group: "auto-mode",
    field: { kind: "switch", key: "auto_mode_enabled" },
  },
  {
    id: "auto_reply_instant",
    tab: "speech",
    group: "auto-mode",
    field: { kind: "switch", key: "auto_reply_instant" },
  },
  {
    id: "auto_mic_device_uid",
    tab: "speech",
    group: "auto-mode",
    field: {
      kind: "device",
      key: "auto_mic_device_uid",
      defaultLabel: "systemMicrophone",
      source: "input",
    },
  },
  {
    id: "auto_silence_ms",
    tab: "speech",
    group: "auto-mode",
    field: {
      kind: "slider",
      key: "auto_silence_ms",
      limits: SETTINGS_LIMITS.autoSilenceMs,
      step: 50,
      readout: "milliseconds",
    },
  },
  {
    id: "auto_min_utterance_ms",
    tab: "speech",
    group: "auto-mode",
    field: {
      kind: "slider",
      key: "auto_min_utterance_ms",
      limits: SETTINGS_LIMITS.autoMinUtteranceMs,
      step: 50,
      readout: "milliseconds",
    },
  },
  {
    id: "auto_max_utterance_secs",
    tab: "speech",
    group: "auto-mode",
    field: {
      kind: "slider",
      key: "auto_max_utterance_secs",
      limits: SETTINGS_LIMITS.autoMaxUtteranceSecs,
      step: 5,
      readout: "seconds",
    },
  },

  {
    id: "screen_share_visible",
    tab: "behavior",
    group: "behavior",
    field: { kind: "switch", key: "screen_share_visible" },
  },
  {
    id: "auto_send",
    tab: "behavior",
    group: "behavior",
    field: { kind: "switch", key: "auto_send" },
  },
  {
    // Declared in onboarding's PrivacyStep, but it must live here too: otherwise
    // it is unreachable after onboarding, and search led to a tab without the
    // row — a dead route.
    id: "copy_results_to_clipboard",
    tab: "behavior",
    group: "behavior",
    field: { kind: "switch", key: "copy_results_to_clipboard" },
  },
  {
    id: "auto_preview_html",
    tab: "behavior",
    group: "behavior",
    field: { kind: "switch", key: "auto_preview_html" },
  },
  {
    id: "teleprompter_resume",
    tab: "behavior",
    group: "behavior",
    field: { kind: "switch", key: "teleprompter_resume" },
  },

  {
    id: "theme",
    tab: "appearance",
    group: "appearance",
    field: {
      kind: "select",
      key: "theme",
      options: THEME_OPTIONS,
      apply: (value: string) => {
        applyTheme(document.documentElement, value);
      },
    },
  },
  {
    id: "language",
    tab: "appearance",
    group: "appearance",
    field: {
      kind: "select",
      key: "language",
      options: LANGUAGE_OPTIONS,
      // Applied to the live document as well as to the draft, exactly like the
      // theme beside it: the draft autosaves 600 ms later and the store adopts
      // the language on the way back, and a picker whose effect arrives a round
      // trip after the click reads as a control that did not work.
      apply: applyLanguage,
    },
  },
  {
    id: "chat_font_size",
    tab: "appearance",
    group: "appearance",
    field: {
      kind: "slider",
      key: "chat_font_size",
      limits: SETTINGS_LIMITS.chatFontSize,
      step: 0.5,
      readout: "pixels",
    },
  },
  {
    id: "window_opacity",
    tab: "appearance",
    group: "appearance",
    field: {
      kind: "slider",
      key: "window_opacity",
      limits: SETTINGS_LIMITS.windowOpacity,
      step: 0.05,
      readout: "percent",
    },
  },

  {
    id: "quick_action_attachments",
    tab: "quick-actions",
    group: null,
    field: { kind: "switch", key: "quick_action_attachments" },
  },
] as const satisfies readonly SettingsEntry[];

export type SettingsEntryId = (typeof SETTINGS_ENTRIES)[number]["id"];

type SettingsGroup = (typeof SETTINGS_GROUPS)[number];

export function settingsGroupsForTab(tab: SettingsTabId): SettingsGroup[] {
  return SETTINGS_GROUPS.filter((group) => group.tab === tab);
}

export function settingsEntriesInGroup(group: string): SettingsEntry[] {
  return SETTINGS_ENTRIES.filter((entry) => entry.group === group);
}

export function settingsEntry(id: SettingsEntryId): SettingsEntry {
  const found = SETTINGS_ENTRIES.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`Unknown settings entry: ${id}`);
  return found;
}
