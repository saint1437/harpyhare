/**
 * The shape of the interactive demo's copy.
 *
 * Every string the mock window shows is a literal the desktop app also shows —
 * `apps/desktop/src/i18n/**` is the source, and the two dictionaries below it
 * (`demo-ru.ts`, `demo-en.ts`) are transcriptions of it, not paraphrases. That
 * is the whole discipline of this file: a visitor who downloads the app after
 * playing with the demo must not meet a different vocabulary. Where the app
 * derives a string at runtime (a hotkey combo, a token count, a step readout)
 * the template is copied with its `{holes}` and filled here the same way.
 *
 * WHAT IS DELIBERATELY NOT HERE. The app's user DATA — quick-action titles,
 * preset bodies, context materials — is Russian in the shipped app regardless
 * of interface language, because it is content the user typed, not UI. The demo
 * seeds plausible equivalents per language instead: an English visitor reading
 * Russian button labels inside an English page would read as a bug, and the
 * demo has no user to have typed them.
 */

export interface DemoMessageSeed {
  role: "user" | "assistant";
  text: string;
}

export interface DemoChatSeed {
  id: string;
  title: string;
  messages: DemoMessageSeed[];
}

export interface VoicePrompt {
  chip: string;
  question: string;
  answer: string;
}

/**
 * The six states the capture indicator can be in, exactly as
 * `apps/desktop/src/lib/listening.ts` resolves them. `armed` is the one a
 * screenshot never shows and the one the product is actually about: the
 * background buffer is holding the last seconds of audio, nothing has been
 * sent anywhere.
 */
export type ListeningStateId = "recording" | "auto" | "armed" | "transcribing" | "off" | "error";

/** The orb adds one state the status bar has no room for: an answer is waiting. */
export type OrbStateId = ListeningStateId | "answer";

export interface ListeningCopy {
  /** The word beside the bars. */
  word: string;
  /** What the live region announces — the app's `announcement`, kept verbatim. */
  announcement: string;
}

export type StateTone = "success" | "danger" | "warning" | "listening" | "neutral";

export interface ScreenCopy {
  label: string;
  description: string;
}

export interface SettingGroupCopy {
  title: string;
  description?: string;
}

/** A hotkey as the reference popover and the settings rows both render it. */
export interface HotkeyCopy {
  id: string;
  label: string;
  hint: string;
  combo: string;
}

export interface HotkeyGroupCopy {
  title: string;
  ids: string[];
}

export interface QuickActionCopy {
  id: string;
  title: string;
  prompt: string;
}

export interface PresetCopy {
  name: string;
  text: string;
}

export interface LibraryDocCopy {
  id: string;
  name: string;
  size: string;
  folder: string;
}

export interface PermissionCopy {
  id: "audio" | "microphone" | "screen";
  label: string;
  purpose: string;
  need: string;
  granted: boolean;
}

export interface StartStepCopy {
  id: "access" | "audio" | "microphone";
  title: string;
  hint: string;
}

/** One row of a settings tab. The control type decides what is rendered. */
export type SettingControl =
  | { kind: "switch"; value: boolean }
  | { kind: "select"; value: string; options: string[] }
  | { kind: "slider"; value: number; min: number; max: number; step: number; unit: string }
  | { kind: "hotkey"; id: string }
  | { kind: "secret"; placeholder: string; stored: string | null }
  | { kind: "text"; value: string };

export interface SettingRowCopy {
  id: string;
  label: string;
  hint?: string;
  control: SettingControl;
  /** Rendered greyed out and inert while the named row is on (or off). */
  disabledBy?: { row: string; when: boolean };
}

export interface SettingsGroupCopy extends SettingGroupCopy {
  rows: SettingRowCopy[];
}

export type SettingsTabId =
  "access" | "speech" | "hotkeys" | "quick-actions" | "window" | "behavior" | "appearance";

export interface SettingsTabCopy {
  label: string;
  description: string;
  groups: SettingsGroupCopy[];
}

export type LauncherScreenId =
  "start" | "contexts" | "presets" | "settings" | "permissions" | "updates";

export interface LauncherCopy {
  wordmark: string;
  skipToContent: string;
  launch: string;
  launching: string;
  search: { placeholder: string; empty: string; breadcrumbSeparator: string };
  status: {
    launching: string;
    checking: string;
    ready: { line: string; detail: string };
    saving: string;
    saved: string;
  };
  states: Record<"done" | "todo" | "checking", string>;
  screens: Record<LauncherScreenId, ScreenCopy>;
  start: {
    stepsTitle: string;
    summaryReady: string;
    steps: StartStepCopy[];
    audioCheck: {
      title: string;
      description: string;
      run: string;
      running: string;
      sources: { id: "system" | "microphone"; label: string; hint: string }[];
      heard: string;
      heardText: string;
      silence: string;
    };
    usageTitle: string;
    usageNote: string;
    defaultsNote: string;
    allSettings: string;
  };
  settings: {
    tabs: Record<SettingsTabId, SettingsTabCopy>;
    quickActions: {
      title: string;
      description: string;
      modifierLabel: string;
      modifierHint: string;
      modifierOption: string;
      attachLabel: string;
      attachHint: string;
      namePlaceholder: string;
      promptPlaceholder: string;
      remove: string;
      add: string;
      items: QuickActionCopy[];
    };
    saveKey: string;
    deleteKey: string;
    whereToGetKey: string;
    accessCode: { label: string; hint: string; placeholder: string; submit: string };
  };
  contexts: {
    summary: string;
    addDoc: string;
    addFolder: string;
    import: string;
    edit: string;
    remove: string;
    folders: string[];
    docs: LibraryDocCopy[];
  };
  presets: {
    ownTitle: string;
    ownDescription: string;
    add: string;
    edit: string;
    remove: string;
    length: string;
    builtInTitle: string;
    builtInDescription: string;
    items: PresetCopy[];
    builtIn: string[];
  };
  permissions: {
    title: string;
    description: string;
    recheck: string;
    grant: string;
    openSettings: string;
    states: Record<"granted" | "denied" | "unknown", string>;
    items: PermissionCopy[];
  };
  updates: {
    versionTitle: string;
    versionDescription: string;
    check: string;
    upToDate: string;
    autoCheckNote: string;
    notesLabel: string;
    notes: string[];
  };
}

export interface HudCopy {
  /** The window's accessible name — it is a mock, and says so. */
  frameLabel: string;
  listening: Record<ListeningStateId, ListeningCopy>;
  listeningLabel: string;
  pauseTitle: string;
  resumeTitle: string;
  orbLabels: Record<OrbStateId, string>;
  orbAnswerAnnouncement: string;
  contextUsage: string;
  collapse: string;
  collapseRestore: string;
  stop: string;
  quit: string;
  teleprompter: string;
  copyLast: string;
  copied: string;
  hotkeys: string;
  closeHotkeys: string;
  autoMode: Record<"active" | "idle", { label: string; action: string }>;
  screenShare: Record<"visible" | "hidden", { label: string; action: string }>;
  chats: {
    nav: string;
    chat: string;
    closeChat: string;
    newChat: string;
    duplicate: string;
  };
  answer: {
    emptyHint: string;
    emptyNoCombo: string;
    copyMessage: string;
    resendMessage: string;
    removeMessage: string;
    jumpToBottom: string;
  };
  thinking: { label: string; seconds: string; minutes: string };
  autoTranscript: {
    title: string;
    empty: string;
    instant: string;
    answer: string;
    answered: string;
    pending: string;
    speakers: { interviewer: string; user: string };
    turns: { speaker: "interviewer" | "user"; text: string }[];
  };
  composer: {
    placeholder: string;
    quickActionsLabel: string;
    clearHistory: string;
    context: string;
    captureRegion: string;
    requestParams: string;
    closeRequestParams: string;
    retryTranscription: string;
    stopAnswer: string;
    send: string;
    sendTitle: string;
    params: { model: string; preset: string; thinking: string; webSearch: string };
    noPreset: string;
    models: string[];
    attachmentAlt: string;
    removeAttachment: string;
  };
  preview: { title: string; copyCode: string; close: string; body: string };
  teleprompterPanel: {
    restart: string;
    play: string;
    pause: string;
    speed: string;
    font: string;
    close: string;
    empty: string;
  };
  connectivity: { title: string; hint: string };
  notifications: {
    details: string;
    collapse: string;
    copy: string;
    copied: string;
    dismiss: string;
    /** The demo's error vocabulary, drawn from the app's 17 `ErrorCode`s. */
    items: { id: string; tone: "danger" | "warning"; title: string; body: string }[];
  };
  htmlBlock: { lines: string; openPreview: string };
}

/**
 * The controls that sit OUTSIDE the mock window.
 *
 * Everything the app can reach from its own chrome, the demo reaches the same
 * way -- the header buttons and the keyboard. Two states have no in-app trigger
 * because in the app they are things that happen TO you: losing the network and
 * an error coming back from a provider. Those get a chip below the frame, kept
 * visibly outside it so the window itself never grows an affordance the product
 * does not have.
 */
export interface DemoControlsCopy {
  label: string;
  offline: string;
  error: string;
  keysHint: string;
}

export interface DemoCopy {
  frameLabel: string;
  ask: string;
  controls: DemoControlsCopy;
  caption: string;
  disclosure: string | null;
  depth: { label: string; options: { id: "default" | "black"; label: string }[] };
  newChatTitle: string;
  chats: DemoChatSeed[];
  prompts: VoicePrompt[];
  fallbackAnswer: string;
  version: string;
  hotkeys: HotkeyCopy[];
  hotkeyGroups: HotkeyGroupCopy[];
  hotkeyFieldHints: { combo: string; label: string }[];
  launcher: LauncherCopy;
  hud: HudCopy;
}
