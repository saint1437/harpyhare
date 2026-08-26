import type { Speaker } from "@/ipc/types";
import type { ListeningState } from "@/lib/listening";

/**
 * Copy that belongs to no single window: the capture vocabulary, the shared
 * `components/`, and the handful of framework-free modules under `lib/` that
 * used to hold a Russian constant of their own.
 *
 * A namespace here imports from `lib` only where that module is a LEAF — one
 * that will never need a dictionary itself. `NotificationTone` and `ApiKeyId`
 * are written out as literal unions instead of imported for exactly that
 * reason: their modules do take a `Dictionary`, and importing the type back
 * would close a cycle (`i18n/types` → `common-types` → `lib/x` → `i18n/types`)
 * that `import-x/no-cycle` is there to catch.
 */
export interface ListeningCopy {
  /** The word printed beside the meter. */
  word: string;
  /** What a screen reader is told, which needs more than the on-screen word. */
  announcement: string;
}

export interface CommonCopy {
  /** Verbs the whole app shares. One wording per action, not one per screen. */
  actions: {
    retry: string;
    cancel: string;
    close: string;
    more: string;
    less: string;
    copy: string;
    copied: string;
    open: string;
    add: string;
    remove: string;
    save: string;
    back: string;
    next: string;
    done: string;
  };
  listening: Record<ListeningState, ListeningCopy>;
  /** How a turn is attributed ON SCREEN — see `lib/auto-turns` for the other one. */
  speakers: Record<Speaker, string>;
  apiKeys: {
    accessTitle: string;
    purpose: Record<"anthropic" | "groq", string>;
    /** `{names}` — one key, or several joined by the conjunction below. */
    missingOne: string;
    missingMany: string;
    and: string;
  };
  chat: {
    /** The stem of an unnamed chat's title: "Чат 3" / "Chat 3". */
    untitled: string;
  };
  contextLibrary: {
    /** `{limit}` materials. */
    limitNotice: string;
    unnamedDoc: string;
    unnamedFolder: string;
  };
  image: {
    fileReadFailed: string;
    canvasUnavailable: string;
    messageImageUnreadable: string;
  };
  notifications: {
    toneTitles: Record<"danger" | "warning" | "success", string>;
    /** `{count}` — how many identical notifications collapsed into one card. */
    repeat: string;
    dismiss: string;
  };
  accessCode: {
    successTitle: string;
    successDetail: string;
    submitting: string;
    submit: string;
  };
  errorBoundary: {
    title: string;
    text: string;
    reload: string;
    quit: string;
  };
  storage: {
    chatsLoadFailed: string;
    chatsSaveFailed: string;
    libraryLoadFailed: string;
    librarySaveFailed: string;
    settingsRecoveryTitle: string;
    /** `{reason}` and `{path}` come from Rust's recovery record. */
    settingsRecoveryDetail: string;
  };
}
