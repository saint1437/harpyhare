import type { OnboardingCopy } from "./onboarding-types";

export const onboardingEn: OnboardingCopy = {
  steps: { access: "Access", audio: "Audio", privacy: "Privacy", ready: "Ready" },
  shell: {
    position: "Step {step} of {total}",
    announcement: "First-run setup, step {step} of {total}",
  },
  access: {
    heading: "Prompts while you talk",
    intro:
      "The app listens to the other side — a call, a meeting or a video — transcribes the speech and suggests an answer. The window stays yours: nobody sees it, even during a screen share.",
    offline: "No connection — check the internet and try again.",
    configured: "Access is already set up — requests go out under your name.",
    codeLabel: "Access code",
    codeHint: "The subscription owner issues the code. It replaces both keys.",
    ownKeys: "I have my own Anthropic and Groq keys",
  },
  audio: {
    heading: "Allow recording system audio",
    why: "Without it the app will not hear the other side — it takes the audio macOS sends to your headphones or speakers. The microphone stays off.",
    deniedNote:
      "Until access is granted the app cannot hear the other side. You can grant it at any time on the “Permissions” screen.",
    skip: "Skip — set it up later",
    grant: "Allow",
    openSystemSettings: "Open macOS settings",
    asking: "the system is asking…",
    states: { granted: "granted", denied: "denied", unknown: "not granted" },
  },
  privacy: {
    heading: "What the app hears, and when",
    disclosures: [
      "While you hold the record key, audio goes off to be transcribed. That is the only moment anything leaves your computer.",
      "The background buffer keeps the last seconds of audio in memory so the start of a sentence is not lost. It is never written to disk and is cleared when you switch it off.",
      "Transcripts and screenshots are copied to the clipboard so you can paste them anywhere.",
      "The microphone is used by auto listening only — and that is off.",
    ],
    closing: "Listening is visible in the window and pauses with one button.",
    togglesTitle: "What you can switch off right now",
    toggles: {
      buffer: {
        label: "Background buffer",
        hint: "Catches what was said in the seconds before the press.",
      },
      clipboard: {
        label: "Copy to the clipboard",
        hint: "Transcripts and screenshots.",
      },
    },
  },
  ready: {
    headingReady: "All set",
    headingAlmost: "Almost there",
    unassigned: "not assigned",
    afterwards:
      "Let go and the transcript lands in the input field. The rest of the shortcuts are listed in the window, under the keyboard button.",
    launch: "Launch",
    launching: "Launching…",
    grantAudio: "Grant access",
    openLauncher: "Open settings",
    continueWithout: "Carry on without it",
    audioOk: "System audio",
    audioMissing: "System audio is not granted — launching is unavailable without it.",
  },
};
