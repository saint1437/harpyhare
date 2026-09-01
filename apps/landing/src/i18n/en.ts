import { demoEn } from "./demo-en";
import type { Dictionary } from "./types";

export const en: Dictionary = {
  locale: "en",
  meta: {
    title: "harpyhare — hears the question, shows the answer",
    description:
      "A macOS and Windows app: hold a key and harpyhare captures system audio, transcribes it and streams the answer from the model you picked in a floating window. The window stays out of screen shares.",
    ogTitle: "harpyhare — hears the question, shows the answer",
    ogDescription:
      "System audio capture, instant transcription and an answer from Claude, GPT or Grok in a window that floats above everything else. Builds for macOS and Windows.",
    keywords: [
      "system audio capture",
      "speech to text",
      "meeting assistant",
      "interview assistant",
      "Claude",
      "GPT",
      "Grok",
      "invisible during screen sharing",
      "teleprompter",
      "macOS",
      "Windows",
    ],
    applicationCategoryLabel: "Productivity utility",
  },
  skipToContent: "Skip to content",
  nav: {
    label: "Primary navigation",
    how: "How it works",
    features: "Features",
    faq: "FAQ",
    releases: "Releases",
    download: "Download",
  },
  hero: {
    badge: "A quiet assistant · macOS + Windows",
    titleSolid: ["Hears", "the question."],
    titleOutline: ["Shows", "the answer."],
    lead: "Hold a key — harpyhare records system audio, transcribes the speech and streams the answer above every other window. A couple of seconds — and the answer is on a screen only you can see.",
    allVersions: "All versions",
  },
  download: {
    primaryPrefix: "Download for",
    unavailable: "All releases on GitHub",
  },
  marquee: [
    "Invisible during screen sharing",
    "Zoom",
    "Meet",
    "Interview",
    "Lecture",
    "~2 seconds to an answer",
  ],
  app: demoEn,
  how: {
    title: "Three steps to an answer",
    hint: "hold F9",
    steps: [
      {
        number: "01",
        title: "Hold the key",
        text: "harpyhare starts listening to system audio — the other person on the call or the soundtrack of a video.",
      },
      {
        number: "02",
        title: "Let go",
        text: "Speech is transcribed while you are still recording, so the text is ready almost instantly.",
      },
      {
        number: "03",
        title: "Read the answer",
        text: "The answer streams into the floating window. Ask a follow-up — the conversation keeps its context.",
      },
    ],
  },
  window: {
    titlePlain: "The answer lives in a window ",
    titleOutline: "only you can see",
    sub: "The window floats above every app and never lands in a screen capture. Opacity, size and hotkeys are all adjustable. Below is a working mock-up — go ahead and click around.",
    cards: [
      {
        title: "Teleprompter mode",
        text: "One key turns the answer into large text with smooth auto-scroll.",
      },
      {
        title: "Screenshot into the question",
        text: "A region screenshot goes straight into the chat as an attachment.",
      },
      {
        title: "History and pre-prompts",
        text: "Parallel chats, pre-prompts and a context library — your résumé always at hand.",
      },
    ],
  },
  visibility: {
    title: "What they see",
    yours: "Your screen",
    theirs: "Screen share in Zoom / Meet",
    empty: "Nothing here",
    sample: "Optimistic locking takes no lock — it reads the row version and checks it on write…",
    caveat:
      "The window is marked as protected from capture: in screen recordings and screenshots its place is simply empty. One honest caveat: the pixels are hidden, the process is not — the app is still listed among running processes (as “Audio System”).",
  },
  features: {
    title: "What harpyhare does",
    items: [
      {
        title: "System audio, not the microphone",
        text: "It captures what you hear: the other person on a call, a voice from a video, a webinar recording. No virtual audio devices required.",
      },
      {
        title: "Transcription on the fly",
        text: "Speech becomes text in a fraction of a second — in English, Russian and dozens of other languages. Pick your transcription provider: Groq, OpenAI or Grok.",
      },
      {
        title: "Claude, GPT and Grok — your pick",
        text: "Switch models right inside the chat; every chat keeps its own. One provider key is enough — the app is tied to nobody. Chat history, screenshots and syntax highlighting all live in one place.",
      },
      {
        title: "Invisible to the other side",
        text: "The window never lands in a screen capture: during a Zoom or Meet share, only you can see it.",
      },
      {
        title: "Teleprompter mode",
        text: "One key turns the answer into large text with smooth auto-scroll. Speed and font size are adjustable.",
      },
      {
        title: "Your keys, your data",
        text: "It talks to the provider APIs with your own keys — no third-party servers, accounts or subscriptions.",
      },
    ],
  },
  faq: {
    title: "Frequently asked",
    items: [
      {
        question: "How does the app hear the other person if my microphone is off?",
        answer:
          "It records system audio rather than the microphone — whatever is playing through your headphones or speakers. On macOS that is a Core Audio process tap, on Windows a WASAPI loopback on the output device. You do not need virtual audio devices such as BlackHole or VB-Cable.",
      },
      {
        question: "Is the window visible when I share my screen?",
        answer:
          "No. The window is marked as protected from capture, so in Zoom, Google Meet or a plain screenshot its place is empty — only you can see it. One caveat: the pixels are hidden, the running process is not, so the app is still listed among processes (as “Audio System”).",
      },
      {
        question: "What does it cost and do I need my own API keys?",
        answer:
          "The app is free. You need two keys: one for answers — Anthropic, OpenAI or xAI, whichever you prefer — and one for speech recognition. You pay the providers directly at their rates, with nobody in between. As an alternative there are one-time access codes: requests then go through a proxy and no keys of your own are required.",
      },
      {
        question: "Which languages does the transcription understand?",
        answer:
          "English, Russian and dozens of other languages; you can pin the language or leave auto-detection on. The transcription provider is switchable in settings: Groq (Whisper), OpenAI or Grok. Groq and OpenAI also offer a translation mode, which converts speech in any language straight into English text.",
      },
      {
        question: "What are the system requirements?",
        answer:
          "macOS 14.2 or newer on Apple Silicon, or Windows 10 version 2004 and newer on x64. An internet connection is required: transcription and answers go through APIs. On macOS the system will ask for permission to record system audio on first launch.",
      },
      {
        question: "Where do my conversations go?",
        answer:
          "Audio goes to whichever transcription provider you chose, and the text to whichever model you chose. The app runs no servers of its own and needs no account. Chat history, settings and reference material stay on your disk in the app's own folder.",
      },
    ],
  },
  cta: {
    titlePlain: "Try it on your next ",
    titleOutline: "call",
    text: "The app is free — all you need are your own API keys, or an access code.",
  },
  footer: {
    github: "GitHub",
    localeSwitch: "По-русски",
  },
};
