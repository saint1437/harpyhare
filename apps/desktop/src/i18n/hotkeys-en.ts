import type { HotkeysCopy } from "./hotkeys-types";

export const hotkeysEn: HotkeysCopy = {
  groups: {
    recording: "Recording",
    sending: "Sending",
    window: "Window",
    chat: "Chat",
    teleprompter: "Teleprompter",
  },
  actions: {
    record: {
      label: "Record system audio",
      hint: "Hold it while the other person is speaking.",
    },
    auto_mode: {
      label: "Auto listening",
      hint: "Listens to them and to you for as long as it is on.",
    },
    cancel_recording: {
      label: "Cancel the recording or the answer",
      hint: "While recording it cancels; while an answer is streaming it stops it.",
    },
    send: {
      label: "Send",
      hint: "Works from anywhere in the window, not only from the input field.",
    },
    auto_answer: {
      label: "Answer what was heard",
      hint: "Sends the collected transcript. Heard even when the window is not focused.",
    },
    screenshot: {
      label: "Screenshot a region",
      hint: "The selected region goes into the chat as an attachment.",
    },
    quick_action: {
      label: "Quick action",
      hint: "A modifier with a digit: 1…9, in button order.",
    },
    focus_prompt: {
      label: "Focus the input field",
      hint: "Raises the window and puts the caret at the end of the text.",
    },
    toggle_window: {
      label: "Hide or show",
      hint: "Works even while the window is hidden.",
    },
    move_window: { label: "Move", hint: "A modifier with the arrow keys." },
    resize_window: { label: "Resize", hint: "A modifier with the arrow keys." },
    opacity: { label: "Opacity", hint: "A modifier with plus and minus." },
    scroll_chat: {
      label: "Scroll the conversation",
      hint: "A modifier with the up and down arrows.",
    },
    duplicate_chat: {
      label: "Duplicate the chat",
      hint: "A new chat with this one's settings and no messages.",
    },
    teleprompter: { label: "Teleprompter", hint: "The answer in large type over the screen." },
    teleprompter_close: {
      label: "Close the teleprompter",
      hint: "Heard only while the teleprompter is open.",
    },
    teleprompter_pause: { label: "Pause the teleprompter", hint: "Stops the autoscroll." },
  },
  fieldHints: {
    send: "send from the input field",
    newline: "line break",
    paste: "paste a screenshot",
  },
  unassigned: "Not assigned — the action is unavailable right now.",
};
