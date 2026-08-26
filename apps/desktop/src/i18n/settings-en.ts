import type { SettingsCopy } from "./settings-types";

export const settingsEn: SettingsCopy = {
  tabs: {
    access: { label: "Keys", description: "Anthropic and Groq keys, or an access code instead." },
    speech: {
      label: "Speech",
      description:
        "Capture devices, transcription language, the background buffer and auto listening.",
    },
    hotkeys: {
      label: "Shortcuts",
      description:
        "Shortcuts for recording, sending, screenshots and the teleprompter. Live while the main window runs.",
    },
    "quick-actions": {
      label: "Actions",
      description: "The buttons above the input field and the digit shortcuts for them.",
    },
    window: {
      label: "Window",
      description: "Modifiers with the arrow keys: move, resize and scroll the chat.",
    },
    behavior: {
      label: "Behaviour",
      description: "Screen sharing, auto send, HTML preview, the teleprompter and the clipboard.",
    },
    appearance: {
      label: "Look",
      description: "Language, theme, window opacity and the chat's font size.",
    },
  },
  groups: {
    stt: {
      title: "Speech recognition",
      description: "What exactly the app listens to, and which language it transcribes.",
    },
    "auto-mode": {
      title: "Auto listening",
      description: "Listens to both sides of the conversation and answers them without a keypress.",
    },
    behavior: { title: "Behaviour", description: "How the app behaves while you work." },
    appearance: { title: "Look", description: "The appearance of the main chat window." },
  },
  entries: {
    capture_device_uid: {
      label: "Capture device",
      hint: "Only this output is captured. Anything playing into another device will not be picked up.",
    },
    stt_language: {
      label: "Recognition language",
      hint: "Whisper is more accurate when the language is stated explicitly.",
    },
    stt_translate: {
      label: "Translate to English",
      hint: "Speech in any language arrives in the chat in English.",
    },
    buffer_enabled: {
      label: "Background buffer",
      hint: "Catches what was said in the seconds before you pressed record.",
    },
    buffer_seconds: {
      label: "Buffer depth",
      hint: "How many seconds of audio are kept in memory.",
    },
    auto_mode_enabled: {
      label: "Start with the app",
      hint: "Otherwise it is turned on from the window header or with a shortcut.",
    },
    auto_reply_instant: {
      label: "Answer without a keypress",
      hint: "Otherwise the answer goes out on a key — you decide what to answer.",
    },
    auto_mic_device_uid: {
      label: "Microphone",
      hint: "Your own speech is taken from it — the other side of the conversation.",
    },
    auto_silence_ms: {
      label: "Pause that ends a turn",
      hint: "This much silence counts as the end of a phrase.",
    },
    auto_min_utterance_ms: {
      label: "Shortest turn",
      hint: "Anything shorter counts as noise and is not transcribed.",
    },
    auto_max_utterance_secs: {
      label: "Longest turn",
      hint: "A monologue longer than this is cut into parts.",
    },
    screen_share_visible: {
      label: "Show the window while sharing the screen",
      hint: "By default the window is cut out of the capture and nobody else sees it. Turn this on only if you mean to show it.",
    },
    auto_send: {
      label: "Send as soon as it is transcribed",
      hint: "The transcript goes into the chat without pressing send.",
    },
    copy_results_to_clipboard: {
      label: "Copy to the clipboard",
      hint: "Transcripts and screenshots.",
    },
    auto_preview_html: {
      label: "Open the HTML preview",
      hint: "When an answer contains an HTML block, a preview panel opens beside the chat.",
    },
    teleprompter_resume: {
      label: "The teleprompter resumes where it stopped",
      hint: "Otherwise the text starts from the top every time.",
    },
    theme: {
      label: "Theme",
      hint: "“System” follows the macOS or Windows appearance.",
    },
    language: {
      label: "Interface language",
      hint: "“System” takes the language from your macOS or Windows settings.",
    },
    chat_font_size: {
      label: "Chat font size",
      hint: "Affects the conversation's text and the code in answers.",
    },
    window_opacity: {
      label: "Window opacity",
      hint: "You can see through the window to what is behind it.",
    },
    quick_action_attachments: {
      label: "Attach the images",
      hint: "A quick action will send the images from the input field along with its prepared prompt.",
    },
  },
  optionLabels: {
    sttAuto: "Auto-detect",
    themeSystem: "System",
    themeLight: "Light",
    themeDark: "Dark",
    languageSystem: "System",
  },
  readouts: {
    seconds: "{value} s",
    milliseconds: "{value} ms",
    pixels: "{value}px",
    percent: "{value}%",
  },
  devices: {
    systemOutput: "System output",
    systemMicrophone: "System microphone",
    missing: "Unavailable device",
  },
  disabledHints: {
    sttLanguageWhileTranslating: "While translating, the language is detected automatically.",
  },
  permissions: {
    rows: {
      audio: {
        title: "System audio recording",
        purpose:
          "The app hears the other person and transcribes their speech. Without it there is nothing to launch.",
      },
      microphone: {
        title: "Microphone",
        purpose: "Auto listening needs it to tell your speech apart from theirs.",
      },
      screen: {
        title: "Screen recording",
        purpose: "The region screenshot needs it. Everything else works without it.",
      },
    },
    needs: {
      launch: "required",
      "auto-mode": "needed by auto listening",
      optional: "optional",
    },
    grant: "Grant",
    requesting: "Asking…",
    openSettings: "Settings",
  },
  apiKeys: {
    accessCodeActiveDescription:
      "Requests go through shared access by code; your own keys are not used.",
    accessCodeActiveLabel: "Access code is active",
    accessCodeActiveHint: "Unlinking sends requests back to your own API keys.",
    unlink: "Unlink",
    description:
      "You need an access code or a pair of your own API keys — otherwise there is nothing to launch.",
    accessCodeLabel: "Access code",
    accessCodeHint: "The quick way: no keys to set up.",
    keyLabel: "{name} key",
    keyPurpose: "Needed for {purpose}.",
    keyPurposeStored: "Needed for {purpose}. {mask} is stored — enter a new one to replace it.",
    saveKey: "Save",
    clearKey: "Delete",
    consoleKey: "Where to get one",
    replayLabel: "First-run setup",
    replayHint: "A short pass through permissions, privacy and the recording key.",
    replay: "Run it again",
  },
};
