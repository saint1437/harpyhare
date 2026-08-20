import type { DemoCopy } from "./demo-types";

export const demoEn: DemoCopy = {
  frameLabel: "Interactive demo of the app interface",
  ask: "Ask by voice:",
  caption:
    "A working mock-up: the answers are pre-recorded and nothing leaves your browser. In the real app this window floats above everything else, and during a screen share only you can see it.",
  disclosure:
    "The app itself currently ships with a Russian interface; this mock-up is translated.",
  hiddenWindow: "Window hidden — click to bring it back",
  newChatTitle: "New chat",
  version: "0.10.0",

  chats: [
    {
      id: "chat-1",
      title: "Interview",
      messages: [
        {
          role: "user",
          text: "How is optimistic locking different from pessimistic locking?",
        },
        {
          role: "assistant",
          text: "Pessimistic locking takes the lock up front: `SELECT … FOR UPDATE`, and everyone else waits. Optimistic locking takes no lock — it reads the row version and, on write, checks the version has not changed, rolling the transaction back if it has.\n\n— Pessimistic when conflicts are frequent and a retry is expensive: charging money, reserving stock.\n— Optimistic when conflicts are rare: editing a profile, a document draft.\n\nMost product scenarios have few conflicts, so I default to optimistic and add a retry at the service level.",
        },
      ],
    },
    {
      id: "chat-2",
      title: "Client call",
      messages: [
        {
          role: "user",
          text: "The client is asking why the integration takes three weeks instead of three days",
        },
        {
          role: "assistant",
          text: "Three days is only the happy path: get a token and send one request.\n\nThe rest of the time goes into everything that shows up in production:\n\n— Retries and idempotency, so a duplicated webhook does not create a second order.\n— Data reconciliation: their catalogue and ours have to agree, otherwise the gaps surface in reports.\n— Monitoring and alerts — otherwise we hear about a broken integration from the client.\n\nI can split it in two: a working end-to-end flow on staging in a week, then resilience and production load.",
        },
      ],
    },
    {
      id: "chat-3",
      title: "New chat",
      messages: [],
    },
  ],

  prompts: [
    {
      chip: "How would you scale it?",
      question: "So how would you scale the service to a million users?",
      answer:
        "I would start by splitting the load: read replicas for the database, a cache for hot data, a queue for heavy operations. Once writes become the bottleneck — shard by user.\n\n— First I measure instead of guessing: the query profile, the slowest calls, the read-to-write ratio.\n— Then I take the cheap wins: indexes, N+1 queries, batching instead of one call per item.\n— Only after that do I go horizontal, where you start paying for consistency.\n\nA million users on its own says nothing — what matters is how many are active at once and what their load profile looks like.",
    },
    {
      chip: "Hardest bug you fixed",
      question: "Tell me about the hardest bug you have had to fix.",
      answer:
        "A race in token refresh: two parallel requests went for a refresh at the same time, the second one received an already revoked token and logged the user out.\n\nIt only reproduced under load — in the logs it looked like random logouts for about one percent of users.\n\nI fixed it by coalescing: the refresh lives behind a single in-flight promise per user and everyone else awaits its result. Plus a test that deliberately fires two refreshes at once.",
    },
    {
      chip: "Which task queue?",
      question: "Which task queue would you pick, and why?",
      answer:
        "If a queue already exists in the infrastructure, I take it instead of introducing another moving part.\n\n— At small volumes a Postgres table with `SELECT … FOR UPDATE SKIP LOCKED` is enough: transactions, observability and backups are already there.\n— When you need fan-out and replaying the stream — Kafka.\n— When you need delayed jobs and priorities rather than an event stream — RabbitMQ or SQS.\n\nThe deciding factor is not throughput but what happens on failure: what a retry looks like, where the dead-letter queue lives, and how you put a job back by hand.",
    },
  ],

  fallbackAnswer:
    "This is a demo copy of the interface: the answers here are pre-recorded and no request reaches Claude.\n\nIn the app a real answer streams into this spot — driven by the system audio of a call, a lecture or a video, with the chat history and the selected pre-prompt.",

  launcher: {
    statusReady: "Ready to launch",
    statusLaunching: "Starting the main window…",
    launch: "Launch",
    launching: "Starting…",
    screens: {
      contexts: {
        label: "Contexts",
        description: "Reference material you can mix into a chat's system prompt.",
      },
      presets: {
        label: "Pre-prompts",
        description: "Text that goes at the very start of the system prompt.",
      },
      settings: {
        label: "Settings",
        description: "API access, speech recognition, keys, behaviour and appearance.",
      },
      permissions: {
        label: "Permissions",
        description: "System permissions without which parts of the app do not work.",
      },
      updates: {
        label: "Updates",
        description: "The installed version and how to get a newer one.",
      },
    },
    settings: {
      groups: {
        api: { title: "API access", description: "Your own keys or an access code." },
        stt: {
          title: "Speech recognition",
          description: "What to listen to, and from where, while the record key is held.",
        },
        hotkeys: {
          title: "Keyboard shortcuts",
          description: "Any combination; conflicts are resolved for you.",
        },
        window: {
          title: "Window",
          description: "How to move and resize the window from the keyboard.",
        },
        behavior: { title: "Behaviour" },
        appearance: { title: "Appearance" },
      },
      anthropicKey: "Anthropic key",
      groqKey: "Groq key",
      groqKeyHint: "Speech recognition",
      language: "Language",
      languages: ["Auto-detect", "Russian", "English"],
      translate: "Translate into English",
      captureDevice: "Capture device",
      captureDevices: ["System default", "MacBook Pro Speakers", "AirPods Pro"],
      buffer: "Background buffer",
      bufferHint: "Picks up what was said before you pressed the record key",
      bufferLength: "Buffer length",
      secondsUnit: "s",
      hotkeys: [
        {
          label: "Record a question",
          hint: "Hold while the other person is speaking",
          combo: "F9",
        },
        { label: "Show / hide the window", combo: "⌘⇧ H" },
        { label: "Teleprompter", combo: "F10" },
        { label: "Capture a screen region", combo: "⌘⇧ S" },
      ],
      moveModifier: "Move modifier",
      moveStep: "Move step",
      screenShareVisible: "Visible during screen sharing",
      screenShareVisibleHint: "By default the window stays out of any capture",
      autoSend: "Send as soon as the transcript is ready",
      autoPreview: "Open the HTML preview of an answer",
      theme: "Theme",
      themes: { gray: "Grey", black: "Black" },
      chatFontSize: "Chat text size",
    },
    contexts: {
      addFile: "Add a file",
      addFolder: "Folder",
      selectedCount: "Selected",
      remove: "Remove material",
      folders: ["Project Atlas", "General"],
      docs: [
        { id: "d1", name: "Service architecture.md", size: "18 KB", folder: "Project Atlas" },
        { id: "d2", name: "Schema and migrations.md", size: "9 KB", folder: "Project Atlas" },
        { id: "d3", name: "Contract — SLA.pdf", size: "240 KB", folder: "Project Atlas" },
        { id: "d4", name: "Resume.pdf", size: "86 KB", folder: "General" },
        { id: "d5", name: "Glossary.md", size: "4 KB", folder: "General" },
      ],
    },
    presets: {
      add: "Add a pre-prompt",
      activeBadge: "used in new chats",
      items: [
        {
          name: "Speech transcript",
          text: "Answer briefly and to the point. The user's text is a transcript of someone else's speech and may contain recognition errors: reconstruct the meaning instead of asking again.",
        },
        {
          name: "Interview",
          text: "You are helping in a technical interview. Answer in the first person, as the candidate: a short claim first, then two or three supporting points. No filler, no preambles.",
        },
        {
          name: "Client call",
          text: "Phrase the answer so it can be said out loud: no lists of jargon, plain sentences, concrete timelines and next steps.",
        },
      ],
    },
    permissions: {
      group: {
        title: "System permissions",
        description:
          "Requested only when you press the button — macOS prompts never appear on their own.",
      },
      optionalBadge: "optional",
      granted: "Permission granted",
      openSettings: "Settings",
      grant: "Grant",
      items: [
        {
          id: "audio",
          label: "System audio recording",
          hint: "Without it the app cannot hear the other person — launching is blocked.",
          required: true,
        },
        {
          id: "screen",
          label: "Screen recording",
          hint: "Only needed for capturing a screen region.",
          required: false,
        },
      ],
    },
    updates: {
      group: { title: "Version", description: "Updates arrive as a signed bundle." },
      checking: "Checking…",
      latest: "You are on the latest version",
      auto: "Checked automatically every six hours",
      check: "Check",
    },
  },

  hud: {
    listening: "Listening…",
    transcribing: "Transcribing…",
    thinking: "Thinking…",
    secondsSuffix: "s",
    emptyChat: "The chat will appear here",
    closeApp: "Quit the app",
    hideWindow: "Hide the window — bring back with ⌘⇧H",
    teleprompter: "Teleprompter",
    copyLast: "Copy the last answer",
    hotkeys: "Keyboard shortcuts",
    closeHotkeys: "Close the shortcut list",
    stop: "Stop — back to the launcher",
    chatsNav: "Chats",
    chat: "Chat",
    closeChat: "Close chat",
    newChat: "New chat",
    deleteMessage: "Delete message",
    hotkeyGroups: [
      {
        title: "Recording",
        rows: [
          { label: "Record a question", combo: "F9" },
          { label: "Cancel recording", combo: "Esc" },
          { label: "Send", combo: "⌘ ⏎" },
        ],
      },
      {
        title: "Window",
        rows: [
          { label: "Show / hide", combo: "⌘⇧ H" },
          { label: "Move", combo: "⌘ ←→↑↓" },
          { label: "Resize", combo: "⌘⇧ ←→↑↓" },
          { label: "Opacity", combo: "⌘⇧ + −" },
        ],
      },
      {
        title: "Chat",
        rows: [
          { label: "Teleprompter", combo: "F10" },
          { label: "Capture a region", combo: "⌘⇧ S" },
          { label: "Scroll", combo: "⌥ ↑↓" },
        ],
      },
    ],
    composer: {
      placeholder: "The transcript lands here — or type a question yourself",
      clearHistory: "Clear the chat history",
      chatContext: "Chat context",
      screenshot: "Capture a screen region",
      requestParams: "Request parameters",
      closeRequestParams: "Close request parameters",
      stopAnswer: "Stop the answer",
      send: "Send (⏎)",
      model: "Model",
      thinking: "Thinking",
      webSearch: "Web search",
      preset: "Pre-prompt",
      toggles: { on: "On", off: "Off" },
      presets: ["No pre-prompt", "Speech transcript", "Interview"],
    },
  },
};
