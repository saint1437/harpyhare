/**
 * The demo's English copy — a transcription of the desktop app's own English
 * dictionary (`apps/desktop/src/i18n/*-en.ts`), on the same terms as
 * `demo-ru.ts`: the app's wording, not a fresh translation of the Russian.
 *
 * The seeded user data (quick actions, presets, context materials, chat
 * history, transcript turns) is the exception and is written in English here,
 * because it stands in for something a user typed rather than for UI the app
 * ships. The app itself keeps that data in whatever language its owner typed
 * it, which for the shipped seeds is Russian.
 */
import type { DemoCopy } from "./demo-types";

const ANSWER_ISOLATION = `**Isolation levels** are about which anomalies a transaction agrees to see.

- \`READ UNCOMMITTED\` — other transactions' uncommitted writes are visible. PostgreSQL does not really have this level.
- \`READ COMMITTED\` — the PostgreSQL default. Every statement takes its own snapshot, so two identical \`SELECT\`s in one transaction can disagree.
- \`REPEATABLE READ\` — one snapshot per transaction. In PostgreSQL this also rules out phantoms.
- \`SERIALIZABLE\` — serialisability through SSI: a conflicting transaction is rolled back with \`40001\`.

An interviewer usually wants one sentence: **the higher the level, the fewer anomalies and the more rollbacks** — and that the choice comes down to whether your code is willing to retry.`;

const ANSWER_GOROUTINES = `A goroutine is not an OS thread. The Go runtime multiplexes them onto \`GOMAXPROCS\` system threads with an M:N scheduler.

\`\`\`go
func worker(ctx context.Context, jobs <-chan Job) error {
    for {
        select {
        case <-ctx.Done():
            return ctx.Err()
        case job, ok := <-jobs:
            if !ok {
                return nil
            }
            handle(job)
        }
    }
}
\`\`\`

Three things that get asked next:

1. The stack starts at 2 KiB and grows by copying — which is why you can hold hundreds of thousands of them.
2. A goroutine nobody stops lives until the process ends: a leak looks like a steadily climbing \`runtime.NumGoroutine()\`.
3. \`context\` is the one accepted way to say "wrap up": the cancellation channel is passed down, never back out.`;

const ANSWER_FALLBACK = `Short answer — yes, with one caveat.

The answer arrives as a stream, so the first lines are readable before the model has finished. If it runs long, open the **teleprompter**: the same text in large type, scrolling on its own, so you can read it off the screen without looking away.`;

export const demoEn: DemoCopy = {
  frameLabel: "Interactive mock of the app",
  ask: "Ask by voice",
  controls: {
    label: "Show a state",
    offline: "No connection",
    error: "Error",
    keysHint: "The keys work while the mock has focus: {combos}.",
  },
  caption:
    "The mock is live: the keys, the states and collapsing into the orb all behave as they do in the app.",
  disclosure: "The answers in the mock are prepared in advance — no network is involved.",
  depth: {
    label: "Mock background",
    options: [
      { id: "default", label: "Normal" },
      { id: "black", label: "Deep" },
    ],
  },
  newChatTitle: "Chat",
  version: "0.12.0",

  chats: [
    {
      id: "chat-1",
      title: "Tell me about isolation levels",
      messages: [
        { role: "user", text: "Tell me about transaction isolation levels" },
        { role: "assistant", text: ANSWER_ISOLATION },
      ],
    },
    {
      id: "chat-2",
      title: "Chat 2",
      messages: [],
    },
  ],

  prompts: [
    {
      chip: "Isolation levels",
      question: "Tell me about transaction isolation levels",
      answer: ANSWER_ISOLATION,
    },
    {
      chip: "Goroutines",
      question: "How is a goroutine different from an OS thread?",
      answer: ANSWER_GOROUTINES,
    },
  ],
  fallbackAnswer: ANSWER_FALLBACK,

  hotkeys: [
    {
      id: "record",
      label: "Record system audio",
      hint: "Hold it while the other person is speaking.",
      combo: "⌘R",
    },
    {
      id: "auto_mode",
      label: "Auto listening",
      hint: "Listens to them and to you for as long as it is on.",
      combo: "⌘⇧L",
    },
    {
      id: "cancel_recording",
      label: "Cancel the recording or the answer",
      hint: "While recording it cancels; while an answer is streaming it stops it.",
      combo: "Esc",
    },
    {
      id: "send",
      label: "Send",
      hint: "Works from anywhere in the window, not only from the input field.",
      combo: "⌘⏎",
    },
    {
      id: "auto_answer",
      label: "Answer what was heard",
      hint: "Sends the collected transcript. Heard even when the window is not focused.",
      combo: "⌘⇧⏎",
    },
    {
      id: "screenshot",
      label: "Screenshot a region",
      hint: "The selected region goes into the chat as an attachment.",
      combo: "⌘⇧A",
    },
    {
      id: "quick_action",
      label: "Quick actions",
      hint: "A modifier with a digit: 1…9, in button order.",
      combo: "⌘ 1…9",
    },
    {
      id: "focus_prompt",
      label: "Focus the input field",
      hint: "Raises the window and puts the caret at the end of the text.",
      combo: "⌘⇧D",
    },
    {
      id: "toggle_window",
      label: "Hide or show",
      hint: "Works even while the window is hidden.",
      combo: "⌘⇧H",
    },
    {
      id: "move_window",
      label: "Move the window",
      hint: "The modifier with the arrows moves the window.",
      combo: "⌘ ←→↑↓",
    },
    {
      id: "resize_window",
      label: "Resize the window",
      hint: "The modifier with the arrows changes the width and the height.",
      combo: "⌘⇧ ←→↑↓",
    },
    {
      id: "scroll_chat",
      label: "Scroll the conversation",
      hint: "Scrolling the conversation with the up and down arrows.",
      combo: "⌥ ←→↑↓",
    },
    {
      id: "duplicate_chat",
      label: "Duplicate the chat",
      hint: "A new chat with this one's settings and no messages.",
      combo: "⌘⇧N",
    },
    {
      id: "teleprompter",
      label: "Teleprompter",
      hint: "The answer in large type over the screen.",
      combo: "⌘⇧T",
    },
    {
      id: "teleprompter_close",
      label: "Close the teleprompter",
      hint: "Heard only while the teleprompter is open.",
      combo: "Esc",
    },
    {
      id: "teleprompter_pause",
      label: "Pause the teleprompter",
      hint: "Stops the autoscroll.",
      combo: "␣",
    },
  ],
  hotkeyGroups: [
    { title: "Recording", ids: ["record", "auto_mode", "cancel_recording"] },
    {
      title: "Sending",
      ids: ["send", "auto_answer", "screenshot", "quick_action", "focus_prompt"],
    },
    { title: "Window", ids: ["toggle_window", "move_window", "resize_window"] },
    { title: "Chat", ids: ["scroll_chat", "duplicate_chat", "teleprompter"] },
    { title: "Teleprompter", ids: ["teleprompter_close", "teleprompter_pause"] },
  ],
  hotkeyFieldHints: [
    { combo: "⏎", label: "send from the input field" },
    { combo: "⇧⏎", label: "line break" },
    { combo: "⌘V", label: "paste a screenshot" },
  ],

  launcher: {
    wordmark: "harpyhare.ai",
    skipToContent: "Skip to the screen's content",
    launch: "Launch",
    launching: "Launching…",
    search: {
      placeholder: "Search the settings",
      empty: "Nothing found",
      breadcrumbSeparator: " → ",
    },
    status: {
      launching: "Launching the window",
      checking: "Checking permissions",
      ready: { line: "All set", detail: "ready to launch" },
      saving: "Saving",
      saved: "Saved",
    },
    states: { done: "done", todo: "to do", checking: "checking…" },
    screens: {
      start: {
        label: "Start",
        description: "What is left to do before launching. Everything else is already set up.",
      },
      contexts: {
        label: "Contexts",
        description: "Reference materials you can mix into a chat's system prompt.",
      },
      presets: {
        label: "Presets",
        description: "Pre-prompts: text that goes at the front of the system prompt.",
      },
      settings: {
        label: "Settings",
        description: "API access, speech recognition, shortcuts, behaviour and appearance.",
      },
      permissions: {
        label: "Permissions",
        description: "System permissions, without which parts of the app do not work.",
      },
      updates: { label: "Updates", description: "The app's version and installing a new one." },
    },
    start: {
      stepsTitle: "What launching needs",
      summaryReady: "All set — you can launch.",
      steps: [
        {
          id: "access",
          title: "API access",
          hint: "Requests go out under your name — the keys or the code are already in.",
        },
        {
          id: "audio",
          title: "System audio recording",
          hint: "The app hears the other person and transcribes their speech. Without it there is nothing to launch.",
        },
        {
          id: "microphone",
          title: "Microphone",
          hint: "Auto listening needs it to tell your speech apart from theirs.",
        },
      ],
      audioCheck: {
        title: "Sound check",
        description:
          "A granted permission does not yet mean sound is arriving. The check listens for five seconds and shows what it heard.",
        run: "Check",
        running: "Listening…",
        sources: [
          {
            id: "system",
            label: "System audio",
            hint: "The other party's voice: play a video or music and press check.",
          },
          {
            id: "microphone",
            label: "Microphone",
            hint: "Your own speech for auto listening: say a few words after pressing.",
          },
        ],
        heard: "Heard: “{text}”",
        heardText: "testing, one, two, three",
        silence:
          "Silence — no sound arrived. Check the device and that the source is really playing.",
      },
      usageTitle: "How to use it",
      usageNote:
        "Let go — the transcript lands in the input field. Every other shortcut is listed in the main window, under the keyboard button.",
      defaultsNote:
        "Shortcuts, quick actions, window size and appearance already have defaults — you can leave them alone.",
      allSettings: "All settings",
    },
    settings: {
      saveKey: "Save",
      deleteKey: "Delete",
      whereToGetKey: "Where to get one",
      accessCode: {
        label: "Access code",
        hint: "The quick way: no keys to set up.",
        placeholder: "XXXXX-XXXXX-XXXXX-XXXXX",
        submit: "Activate",
      },
      quickActions: {
        title: "Quick actions",
        description:
          "Buttons above the input field: each sends its own ready-made prompt to the chat.",
        modifierLabel: "Shortcut",
        modifierHint: "A modifier with a digit: 1…9, in button order.",
        modifierOption: "{combo} + digit",
        attachLabel: "Attach the images",
        attachHint:
          "A quick action will send the images from the input field along with its prepared prompt.",
        namePlaceholder: "The name — it shows on the button and never goes to the chat",
        promptPlaceholder: "The prompt — this is what goes to the chat instead of the name",
        remove: "Delete the quick action",
        add: "Add",
        items: [
          { id: "detail", title: "In more detail", prompt: "Tell me in more detail." },
          { id: "brief", title: "Shorter", prompt: "Answer shorter, just the point." },
          { id: "code", title: "Code example", prompt: "Show me a code example." },
        ],
      },
      tabs: {
        access: {
          label: "Keys",
          description: "Anthropic and Groq keys, or an access code instead.",
          groups: [
            {
              title: "API access",
              description:
                "You need an access code or a pair of your own API keys — otherwise there is nothing to launch.",
              rows: [
                {
                  id: "anthropic_key",
                  label: "Anthropic key",
                  hint: "Needed for answers from Claude.",
                  control: { kind: "secret", placeholder: "sk-ant-…", stored: "…4f2a" },
                },
                {
                  id: "groq_key",
                  label: "Groq key",
                  hint: "Needed for speech recognition.",
                  control: { kind: "secret", placeholder: "gsk_…", stored: "…9c1d" },
                },
              ],
            },
          ],
        },
        speech: {
          label: "Speech",
          description:
            "Capture devices, transcription language, the background buffer and auto listening.",
          groups: [
            {
              title: "Speech recognition",
              description: "What exactly the app listens to, and which language it transcribes.",
              rows: [
                {
                  id: "capture_device_uid",
                  label: "Capture device",
                  hint: "Only this output is captured. Anything playing into another device will not be picked up.",
                  control: {
                    kind: "select",
                    value: "System output",
                    options: ["System output", "MacBook Pro Speakers", "AirPods Pro"],
                  },
                },
                {
                  id: "stt_language",
                  label: "Recognition language",
                  hint: "Whisper is more accurate when the language is stated explicitly.",
                  control: {
                    kind: "select",
                    value: "English",
                    options: [
                      "Русский",
                      "English",
                      "Українська",
                      "Deutsch",
                      "Español",
                      "Français",
                      "Auto-detect",
                    ],
                  },
                  disabledBy: { row: "stt_translate", when: true },
                },
                {
                  id: "stt_translate",
                  label: "Translate to English",
                  hint: "Speech in any language arrives in the chat in English.",
                  control: { kind: "switch", value: false },
                },
                {
                  id: "buffer_enabled",
                  label: "Background buffer",
                  hint: "Catches what was said in the seconds before you pressed record.",
                  control: { kind: "switch", value: true },
                },
                {
                  id: "buffer_seconds",
                  label: "Buffer depth",
                  hint: "How many seconds of audio are kept in memory.",
                  control: {
                    kind: "slider",
                    value: 4,
                    min: 4,
                    max: 10,
                    step: 1,
                    unit: "{value} s",
                  },
                  disabledBy: { row: "buffer_enabled", when: false },
                },
              ],
            },
            {
              title: "Auto listening",
              description:
                "Listens to both sides of the conversation and answers them without a keypress.",
              rows: [
                {
                  id: "auto_mode_enabled",
                  label: "Start with the app",
                  hint: "Otherwise it is turned on from the window header or with a shortcut.",
                  control: { kind: "switch", value: false },
                },
                {
                  id: "auto_reply_instant",
                  label: "Answer without a keypress",
                  hint: "Otherwise the answer goes out on a key — you decide what to answer.",
                  control: { kind: "switch", value: false },
                },
                {
                  id: "auto_mic_device_uid",
                  label: "Microphone",
                  hint: "Your own speech is taken from it — the other side of the conversation.",
                  control: {
                    kind: "select",
                    value: "System microphone",
                    options: ["System microphone", "MacBook Pro Microphone", "AirPods Pro"],
                  },
                },
                {
                  id: "auto_silence_ms",
                  label: "Pause that ends a turn",
                  hint: "This much silence counts as the end of a phrase.",
                  control: {
                    kind: "slider",
                    value: 700,
                    min: 300,
                    max: 2000,
                    step: 50,
                    unit: "{value} ms",
                  },
                },
                {
                  id: "auto_min_utterance_ms",
                  label: "Shortest turn",
                  hint: "Anything shorter counts as noise and is not transcribed.",
                  control: {
                    kind: "slider",
                    value: 400,
                    min: 200,
                    max: 3000,
                    step: 50,
                    unit: "{value} ms",
                  },
                },
                {
                  id: "auto_max_utterance_secs",
                  label: "Longest turn",
                  hint: "A monologue longer than this is cut into parts.",
                  control: {
                    kind: "slider",
                    value: 30,
                    min: 5,
                    max: 120,
                    step: 5,
                    unit: "{value} s",
                  },
                },
              ],
            },
          ],
        },
        hotkeys: {
          label: "Shortcuts",
          description:
            "Shortcuts for recording, sending, screenshots and the teleprompter. Live while the main window runs.",
          groups: [],
        },
        "quick-actions": {
          label: "Actions",
          description: "The buttons above the input field and the digit shortcuts for them.",
          groups: [],
        },
        window: {
          label: "Window",
          description: "Modifiers with the arrow keys: move, resize and scroll the chat.",
          groups: [
            {
              title: "Move, size and scroll",
              description:
                "A modifier and its step are configured together — they only work as a pair.",
              rows: [
                {
                  id: "move_step",
                  label: "Move",
                  hint: "The modifier with the arrows moves the window; the step is how many pixels per press.",
                  control: {
                    kind: "slider",
                    value: 20,
                    min: 1,
                    max: 200,
                    step: 5,
                    unit: "{value}px",
                  },
                },
                {
                  id: "resize_step",
                  label: "Resize",
                  hint: "The modifier with the arrows changes the window's width and height.",
                  control: {
                    kind: "slider",
                    value: 20,
                    min: 1,
                    max: 200,
                    step: 5,
                    unit: "{value}px",
                  },
                },
                {
                  id: "scroll_step",
                  label: "Scroll the conversation",
                  hint: "Scrolling the conversation with the up and down arrows.",
                  control: {
                    kind: "slider",
                    value: 120,
                    min: 10,
                    max: 1000,
                    step: 5,
                    unit: "{value}px",
                  },
                },
              ],
            },
          ],
        },
        behavior: {
          label: "Behaviour",
          description:
            "Screen sharing, auto send, HTML preview, the teleprompter and the clipboard.",
          groups: [
            {
              title: "Behaviour",
              description: "How the app behaves while you work.",
              rows: [
                {
                  id: "screen_share_visible",
                  label: "Show the window while sharing the screen",
                  hint: "By default the window is cut out of the capture and nobody else sees it. Turn this on only if you mean to show it.",
                  control: { kind: "switch", value: false },
                },
                {
                  id: "auto_send",
                  label: "Send as soon as it is transcribed",
                  hint: "The transcript goes into the chat without pressing send.",
                  control: { kind: "switch", value: false },
                },
                {
                  id: "copy_results_to_clipboard",
                  label: "Copy to the clipboard",
                  hint: "Transcripts and screenshots.",
                  control: { kind: "switch", value: true },
                },
                {
                  id: "auto_preview_html",
                  label: "Open the HTML preview",
                  hint: "When an answer contains an HTML block, a preview panel opens beside the chat.",
                  control: { kind: "switch", value: true },
                },
                {
                  id: "teleprompter_resume",
                  label: "The teleprompter resumes where it stopped",
                  hint: "Otherwise the text starts from the top every time.",
                  control: { kind: "switch", value: true },
                },
              ],
            },
          ],
        },
        appearance: {
          label: "Look",
          description: "Language, theme, window opacity and the chat's font size.",
          groups: [
            {
              title: "Look",
              description: "The appearance of the main chat window.",
              rows: [
                {
                  id: "theme",
                  label: "Theme",
                  hint: "“System” follows the macOS or Windows appearance.",
                  control: {
                    kind: "select",
                    value: "Dark",
                    options: ["System", "Light", "Dark"],
                  },
                },
                {
                  id: "language",
                  label: "Interface language",
                  hint: "“System” takes the language from your macOS or Windows settings.",
                  control: {
                    kind: "select",
                    value: "English",
                    options: ["System", "Русский", "English"],
                  },
                },
                {
                  id: "chat_font_size",
                  label: "Chat font size",
                  hint: "Affects the conversation's text and the code in answers.",
                  control: {
                    kind: "slider",
                    value: 13.5,
                    min: 10,
                    max: 20,
                    step: 0.5,
                    unit: "{value}px",
                  },
                },
                {
                  id: "window_opacity",
                  label: "Window opacity",
                  hint: "You can see through the window to what is behind it.",
                  control: {
                    kind: "slider",
                    value: 90,
                    min: 75,
                    max: 100,
                    step: 5,
                    unit: "{value}%",
                  },
                },
              ],
            },
          ],
        },
      },
    },
    contexts: {
      summary: "materials: {docs} · folders: {folders}",
      addDoc: "Material",
      addFolder: "Folder",
      import: "Import",
      edit: "Edit",
      remove: "Delete the material",
      folders: ["The role", "About me"],
      docs: [
        { id: "jd", name: "Job description.md", size: "4.2k chars", folder: "The role" },
        { id: "stack", name: "Team stack.txt", size: "1.1k chars", folder: "The role" },
        { id: "cv", name: "Resume.md", size: "6.8k chars", folder: "About me" },
        { id: "stories", name: "Project stories.md", size: "12k chars", folder: "About me" },
      ],
    },
    presets: {
      ownTitle: "Your presets",
      ownDescription:
        "A pre-prompt goes at the front of the chat's system prompt and is picked in the toolbar under the input field.",
      add: "Add a preset",
      edit: "Edit the preset",
      remove: "Delete the preset",
      length: "{count} chars",
      builtInTitle: "Built-in",
      builtInDescription:
        "They ship with the app and update themselves — they appear in the same list in the chat.",
      items: [
        {
          name: "Brief and to the point",
          text: "Answer to the point, no preamble. Five sentences at most unless asked for more.",
        },
        {
          name: "Go interview",
          text: "You are a candidate for a Go developer role. Answer in the first person and give short code examples.",
        },
      ],
      builtIn: [
        "Golang",
        "Hr Interview",
        "System Design",
        "Frontend",
        "Java",
        "Python",
        "C#",
        "DevOps",
      ],
    },
    permissions: {
      title: "macOS permissions",
      description:
        "The system grants them only on request. Press “Grant” — macOS will ask for confirmation; if no window appeared, the permission is already decided and changes in System Settings.",
      recheck: "Check again",
      grant: "Grant",
      openSettings: "Settings",
      states: { granted: "granted", denied: "no access", unknown: "not granted" },
      items: [
        {
          id: "audio",
          label: "System audio recording",
          purpose:
            "The app hears the other person and transcribes their speech. Without it there is nothing to launch.",
          need: "required",
          granted: true,
        },
        {
          id: "microphone",
          label: "Microphone",
          purpose: "Auto listening needs it to tell your speech apart from theirs.",
          need: "needed by auto listening",
          granted: true,
        },
        {
          id: "screen",
          label: "Screen recording",
          purpose: "The region screenshot needs it. Everything else works without it.",
          need: "optional",
          granted: false,
        },
      ],
    },
    updates: {
      versionTitle: "Version",
      versionDescription: "The installed harpyhare.ai build.",
      check: "Check",
      upToDate: "The latest version is installed",
      autoCheckNote: "The check runs automatically at start and every six hours.",
      notesLabel: "What's new",
      notes: [
        "The teleprompter remembers where it stopped.",
        "Auto listening tells your speech apart from the other person's.",
        "The window collapses into an orb and stays out of a screen share.",
      ],
    },
  },

  hud: {
    frameLabel: "Main window",
    listeningLabel: "Capture state",
    listening: {
      recording: { word: "Recording", announcement: "System audio is being recorded" },
      auto: { word: "Listening", announcement: "Auto listening is on, audio is being recorded" },
      armed: {
        word: "Standing by",
        announcement: "The background buffer holds the last seconds of audio",
      },
      transcribing: { word: "Transcribing", announcement: "Transcribing speech" },
      off: { word: "Not listening", announcement: "Nothing is being recorded" },
      error: { word: "Error", announcement: "Error" },
    },
    pauseTitle: "Pause — turn off the background buffer and auto listening",
    resumeTitle: "Listen — turn the background buffer on",
    orbLabels: {
      recording: "Recording — click to expand",
      auto: "Auto listening — click to expand",
      armed: "Standing by — click to expand",
      transcribing: "Transcribing — click to expand",
      answer: "The answer is ready — click to expand",
      off: "Not listening — click to expand",
      error: "Error — click to expand",
    },
    orbAnswerAnnouncement: "The answer is ready",
    contextUsage: "Chat context: {used} of {max} tokens (as of the last request)",
    collapse: "Collapse into the orb",
    collapseRestore: "{label} — bring it back: {combo}",
    stop: "Stop — back to the launcher",
    quit: "Quit the app",
    teleprompter: "Teleprompter",
    copyLast: "Copy the last answer",
    copied: "Copied",
    hotkeys: "Keyboard shortcuts",
    closeHotkeys: "Close",
    autoMode: {
      active: { label: "Auto listening is on", action: "click to turn it off" },
      idle: { label: "Auto listening is off", action: "click to listen to them and to you" },
    },
    screenShare: {
      visible: { label: "Visible during screen sharing", action: "click to hide it" },
      hidden: { label: "Hidden during screen sharing", action: "click to show it" },
    },
    chats: {
      nav: "Chats",
      chat: "Chat {number}",
      closeChat: "Close chat {number}",
      newChat: "New chat",
      duplicate: "Duplicate the chat — same settings, no messages",
    },
    answer: {
      emptyHint: "Hold it while the other person is speaking.",
      emptyNoCombo: "No recording key is assigned — set one in the settings.",
      copyMessage: "Copy the message",
      resendMessage: "Resend (everything below is replaced by the new answer)",
      removeMessage: "Delete the message",
      jumpToBottom: "↓ Down",
    },
    thinking: { label: "Thinking…", seconds: "{seconds}s", minutes: "{minutes}m {seconds}s" },
    autoTranscript: {
      title: "Transcript",
      empty: "Listening — turns will appear here.",
      instant: "Answering the other person's turns on my own.",
      answer: "Answer",
      answered: "Everything heard has already gone to the chat.",
      pending: "Turns not sent: {count}.",
      speakers: { interviewer: "Interviewer", user: "Me" },
      turns: [
        {
          speaker: "interviewer",
          text: "Tell me how you deal with data races in concurrent code.",
        },
        { speaker: "user", text: "I usually start by making the state immutable." },
        { speaker: "interviewer", text: "And when the state really is shared — what then?" },
      ],
    },
    composer: {
      placeholder: "The transcript appears here — or write the question yourself",
      quickActionsLabel: "Quick actions",
      clearHistory: "Clear the chat history",
      context: "Chat context",
      captureRegion: "Screenshot a region",
      requestParams: "Request parameters",
      closeRequestParams: "Close the request parameters",
      retryTranscription: "Transcribe again",
      stopAnswer: "Stop the answer",
      send: "Send",
      sendTitle: "Send (⏎)",
      params: {
        model: "Model",
        preset: "Pre-prompt",
        thinking: "Thinking",
        webSearch: "Web search",
      },
      noPreset: "No pre-prompt",
      models: ["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-5"],
      attachmentAlt: "Attachment",
      removeAttachment: "Delete the attachment",
    },
    preview: {
      title: "Preview",
      copyCode: "Copy the code",
      close: "Close",
      body: "The preview panel opens by itself when an answer contains an HTML block.",
    },
    teleprompterPanel: {
      restart: "From the top",
      play: "Play (Space)",
      pause: "Pause (Space)",
      speed: "Speed",
      font: "Font",
      close: "Close (Esc)",
      empty: "No answer to read",
    },
    connectivity: {
      title: "Waiting for an internet connection",
      hint: "The app needs the internet. Check your network or VPN — this screen goes away on its own.",
    },
    notifications: {
      details: "Details",
      collapse: "Collapse",
      copy: "Copy",
      copied: "Copied",
      dismiss: "Dismiss the notification",
      items: [
        {
          id: "silence",
          tone: "warning",
          title: "Silence",
          body: "Nothing to transcribe. If sound was playing, check the “System audio recording” permission and the capture device.",
        },
        {
          id: "network",
          tone: "warning",
          title: "No connection",
          body: "Check your internet or VPN.",
        },
        {
          id: "contextTooLong",
          tone: "danger",
          title: "Context is too long",
          body: "The conversation no longer fits the model's window. Start a new chat or drop some materials.",
        },
      ],
    },
    htmlBlock: { lines: "{count} lines", openPreview: "Open the preview" },
  },
};
