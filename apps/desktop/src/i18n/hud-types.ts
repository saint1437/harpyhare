import type { OrbState } from "@/lib/orb";

/**
 * One group per surface of the floating window, in the order the eye meets them:
 * the header, the answer, the composer beneath it, then the panels that appear
 * over or beside them.
 *
 * `lib/orb` is imported for its state union alone — the same licence
 * `common-types` takes with `lib/listening`: it is a LEAF that will never need a
 * dictionary of its own, so no cycle can form. Keying a record by such a union
 * is what makes the two locales exhaustive by the compiler rather than by
 * inspection: a state added to the orb fails `tsc` until both describe it.
 */
export interface HudCopy {
  /** The header: the capture object, the gauge and the three window verbs. */
  statusBar: {
    /** Names the capture object for a screen reader. */
    listeningLabel: string;
    openTeleprompter: string;
    copyLastAnswer: string;
    /** `{used}` and `{max}` are already grouped for the locale. */
    contextUsage: string;
    collapse: string;
    /** `{label}` is the line above, `{combo}` the hotkey that brings it back. */
    collapseRestore: string;
    stop: string;
    quit: string;
  };
  /**
   * The update flow. The header badge and the dialog it opens are one feature
   * and say the same sentence, so they read it from one place.
   */
  update: {
    /** `{version}` — the version on offer. */
    available: string;
    /** `{version}` — shown while the badge is busy. */
    installing: string;
    /** `{percent}` of the download, when the total size is known. */
    downloadingPercent: string;
    /** `{size}` in MiB, when it is not. */
    downloadingSize: string;
    restarting: string;
    failedTitle: string;
    skipVersion: string;
    later: string;
    install: string;
  };
  listeningStatus: {
    resumeTitle: string;
    pauseTitle: string;
    resumeLabel: string;
    pauseLabel: string;
  };
  orb: {
    labels: Record<OrbState, string>;
    /** What a screen reader hears in the one state capture has no word for. */
    answerAnnouncement: string;
  };
  chatTabs: {
    label: string;
    /** `{number}` — the tab's position, which is also its hotkey digit. */
    chat: string;
    closeChat: string;
    newChat: string;
    duplicate: string;
  };
  answer: {
    messageImageAlt: string;
    copyMessage: string;
    resendMessage: string;
    removeMessage: string;
    /** The empty chat, when the recording hotkey has been taken away. */
    emptyNoRecordCombo: string;
    jumpToBottom: string;
  };
  /** The chip an ```html block collapses into, above the answer's prose. */
  htmlBlock: {
    /** `{count}` — how many lines the block hides. */
    lines: string;
    openPreview: string;
  };
  composer: {
    promptPlaceholder: string;
    requestParams: string;
    params: { model: string; preset: string; thinking: string; webSearch: string };
    noPreset: string;
    unnamedPreset: string;
    clearHistory: string;
    context: string;
    captureRegion: string;
    retryTranscription: string;
    stopAnswer: string;
    send: string;
    /** The tooltip, which names the key the aria-label must not repeat. */
    sendTitle: string;
    fromLibrary: string;
    libraryEmpty: string;
    noFolder: string;
    ownText: string;
    ownTextHint: string;
    contextPlaceholder: string;
  };
  quickActions: { barLabel: string };
  attachments: { alt: string; remove: string };
  autoTranscript: {
    title: string;
    empty: string;
    instant: string;
    answer: string;
    answered: string;
    /** `{count}` — turns heard but not yet sent. */
    pending: string;
  };
  /** An indicator that says what it shows and what pressing it would do. */
  autoMode: {
    states: Record<AutoModeState, IndicatorCopy>;
    /** `{label} — {action}`, the two halves joined for the tooltip. */
    title: string;
  };
  screenShare: {
    states: Record<ScreenShareState, IndicatorCopy>;
    title: string;
  };
  thinking: {
    label: string;
    /** `{seconds}` alone under a minute, `{minutes}` and `{seconds}` above it. */
    seconds: string;
    minutes: string;
  };
  teleprompter: {
    empty: string;
    restart: string;
    play: string;
    pause: string;
    speed: string;
    font: string;
    close: string;
  };
  preview: {
    title: string;
    frameTitle: string;
    copyCode: string;
    empty: string;
  };
  connectivity: { title: string; hint: string };
  hotkeysPopover: { title: string };
  /** What a panel that threw prints in place of itself. */
  boundaries: { answer: string; preview: string };
  /** Failures the HUD raises itself, rather than receiving from Rust. */
  notifications: { settingsSaveFailed: string; copyImageFailed: string };
}

export type AutoModeState = "active" | "idle";

export type ScreenShareState = "visible" | "hidden";

export interface IndicatorCopy {
  /** The state itself — also the announced name, which must not move. */
  label: string;
  /** What a press would do, appended to the tooltip only. */
  action: string;
}
