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

export interface ScreenCopy {
  label: string;
  description: string;
}

export interface SettingGroupCopy {
  title: string;
  description?: string;
}

export interface HotkeyRowCopy {
  label: string;
  hint?: string;
  combo: string;
}

export interface HotkeyGroupCopy {
  title: string;
  rows: { label: string; combo: string }[];
}

export interface PermissionCopy {
  id: string;
  label: string;
  hint: string;
  required: boolean;
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

export interface LauncherCopy {
  statusReady: string;
  statusLaunching: string;
  launch: string;
  launching: string;
  screens: {
    contexts: ScreenCopy;
    presets: ScreenCopy;
    settings: ScreenCopy;
    permissions: ScreenCopy;
    updates: ScreenCopy;
  };
  settings: {
    groups: {
      api: SettingGroupCopy;
      stt: SettingGroupCopy;
      hotkeys: SettingGroupCopy;
      window: SettingGroupCopy;
      behavior: SettingGroupCopy;
      appearance: SettingGroupCopy;
    };
    anthropicKey: string;
    groqKey: string;
    groqKeyHint: string;
    language: string;
    languages: string[];
    translate: string;
    captureDevice: string;
    captureDevices: string[];
    buffer: string;
    bufferHint: string;
    bufferLength: string;
    secondsUnit: string;
    hotkeys: HotkeyRowCopy[];
    moveModifier: string;
    moveStep: string;
    screenShareVisible: string;
    screenShareVisibleHint: string;
    autoSend: string;
    autoPreview: string;
    theme: string;
    themes: { gray: string; black: string };
    chatFontSize: string;
  };
  contexts: {
    addFile: string;
    addFolder: string;
    selectedCount: string;
    remove: string;
    folders: string[];
    docs: LibraryDocCopy[];
  };
  presets: {
    add: string;
    activeBadge: string;
    items: PresetCopy[];
  };
  permissions: {
    group: SettingGroupCopy;
    optionalBadge: string;
    granted: string;
    openSettings: string;
    grant: string;
    items: PermissionCopy[];
  };
  updates: {
    group: SettingGroupCopy;
    checking: string;
    latest: string;
    auto: string;
    check: string;
  };
}

export interface HudCopy {
  listening: string;
  transcribing: string;
  thinking: string;
  secondsSuffix: string;
  emptyChat: string;
  closeApp: string;
  hideWindow: string;
  teleprompter: string;
  copyLast: string;
  hotkeys: string;
  closeHotkeys: string;
  stop: string;
  chatsNav: string;
  chat: string;
  closeChat: string;
  newChat: string;
  deleteMessage: string;
  hotkeyGroups: HotkeyGroupCopy[];
  composer: {
    placeholder: string;
    clearHistory: string;
    chatContext: string;
    screenshot: string;
    requestParams: string;
    closeRequestParams: string;
    stopAnswer: string;
    send: string;
    model: string;
    thinking: string;
    webSearch: string;
    preset: string;
    toggles: { on: string; off: string };
    presets: string[];
  };
}

export interface DemoCopy {
  frameLabel: string;
  ask: string;
  caption: string;
  disclosure: string | null;
  hiddenWindow: string;
  newChatTitle: string;
  chats: DemoChatSeed[];
  prompts: VoicePrompt[];
  fallbackAnswer: string;
  version: string;
  launcher: LauncherCopy;
  hud: HudCopy;
}
