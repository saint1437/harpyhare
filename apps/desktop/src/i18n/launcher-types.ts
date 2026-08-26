import type { AudioSource, PermissionState } from "@/ipc/types";
import type { Platform } from "@/lib/platform";

/**
 * The launcher window's copy: the screen registry, the search index, «Старт»,
 * the context library, the presets and quick-action editors, the updates screen.
 *
 * Keyed by the ids that already exist in `features/launcher/screens.ts` and its
 * neighbours — the same rule as `settings-types.ts`.
 *
 * What is deliberately NOT duplicated here: anything the settings namespace
 * already owns. The search index and every launcher screen read tab labels,
 * settings rows, permission titles and permission needs out of `dict.settings`,
 * because a second wording of a row nobody can see on screen is exactly the
 * drift the registries were merged to stop.
 */
export type ScreenKey = "start" | "contexts" | "presets" | "settings" | "permissions" | "updates";

/** `checking` — the permissions have not answered yet; see `start-steps.ts`. */
export type StartStepStateKey = "done" | "todo" | "checking";

/** The three modifier+step pairs of `window-pairs.ts`, keyed by their action. */
export type WindowPairKey = "move_window" | "resize_window" | "scroll_chat";

export interface LabelledCopy {
  label: string;
  hint: string;
}

/** A status line: the word beside the dot, and the quieter half after it. */
export interface StatusCopy {
  line: string;
  detail: string;
}

export interface LauncherCopy {
  screens: Record<ScreenKey, { label: string; description: string }>;
  shell: {
    loading: string;
    skipToContent: string;
    offline: string;
    saveFailedTitle: string;
    launchFailedTitle: string;
    updateCheckFailedTitle: string;
    /** `{version}` — what the sidebar's dot on «Обновления» means. */
    updateAvailable: string;
    /** `{screen}` and `{notice}`: an icon-only item explains its dot in `title`. */
    sidebarNoticeTitle: string;
  };
  launch: {
    idle: string;
    busy: string;
  };
  /** The header's status object — see `StatusObject.tsx` for why saving has its own line. */
  status: {
    launching: string;
    audioCheck: StatusCopy;
    checking: string;
    /** The quiet half beside a blocker's own wording. */
    blockerDetail: string;
    ready: StatusCopy;
    saving: string;
    saved: string;
    saveFailed: StatusCopy;
  };
  /** Blockers the launcher raises itself; the keys blocker is `common.apiKeys`. */
  blockers: {
    audio: string;
    microphone: string;
  };
  search: {
    placeholder: string;
    empty: string;
    /** `{shown}` and `{total}` */
    overflow: string;
    /** Between a screen and a tab in a hit's breadcrumb. */
    breadcrumbSeparator: string;
    /** `{action}` — the window action whose step this row sets. */
    windowStepTitle: string;
  };
  start: {
    stepsTitle: string;
    summaryChecking: string;
    summaryReady: string;
    /** `{count}` steps still open. */
    summaryLeft: string;
    stepStates: Record<StartStepStateKey, string>;
    /** The access step once keys or a code are in place. */
    accessDone: string;
    enterKeys: string;
    changeAccess: string;
    allPermissions: string;
    usageTitle: string;
    /** Stands in for the combination while the record action has none. */
    unassignedCombo: string;
    usageNote: string;
    defaultsNote: string;
    allSettings: string;
  };
  audioCheck: {
    title: string;
    description: string;
    run: string;
    running: string;
    silence: string;
    noSpeech: string;
    /** `{text}` — what the check actually transcribed. */
    heard: string;
    sources: Record<AudioSource, LabelledCopy>;
  };
  permissions: {
    title: string;
    description: string;
    recheck: string;
    states: Record<PermissionState, string>;
  };
  updates: {
    versionTitle: string;
    /** `{brand}` */
    versionDescription: string;
    check: string;
    checking: string;
    upToDate: string;
    autoCheckNote: string;
    /** `{version}` */
    availableTitle: string;
    availableDescription: string;
    notesLabel: string;
    installLabel: string;
    restarting: string;
    /** `{percent}` */
    downloadPercent: string;
    /** `{size}` — mebibytes, already rounded. */
    downloadSize: string;
    failedTitle: string;
    later: string;
    install: string;
  };
  contexts: {
    /** `{count}` characters, under a thousand. */
    chars: string;
    /** `{count}` thousands of characters. */
    charsThousands: string;
    empty: string;
    /** `{docs}` — how many materials the library holds. */
    summaryDocs: string;
    /** `{docs}` and `{folders}`, once at least one folder exists. */
    summaryDocsAndFolders: string;
    addDoc: string;
    addFolder: string;
    import: string;
    /** `{number}` — the ordinal a fresh folder is named by. */
    newFolderName: string;
    dragDocTitle: string;
    editDoc: string;
    removeDoc: string;
    renameFolder: string;
    removeFolder: string;
    editorNewTitle: string;
    editorTitle: string;
    docNamePlaceholder: string;
    docTextPlaceholder: string;
    noFolder: string;
    /** `{fileManager}` — Finder or the platform's file manager. */
    dropZone: string;
    dropZoneHint: string;
    dropRootHint: string;
    dropFolderHint: string;
    /** `{name}` — the file that could not be imported. */
    importFailedTitle: string;
    /** Named per platform: Finder against the Windows file manager. */
    fileManager: Record<Platform, string>;
  };
  presets: {
    ownTitle: string;
    ownDescription: string;
    emptyTitle: string;
    emptyHint: string;
    create: string;
    add: string;
    unnamed: string;
    /** `{count}` characters of preset text. */
    length: string;
    lengthEmpty: string;
    edit: string;
    remove: string;
    nameLabel: string;
    namePlaceholder: string;
    textLabel: string;
    textPlaceholder: string;
    builtInTitle: string;
    builtInDescription: string;
  };
  quickActions: {
    title: string;
    description: string;
    comboLabel: string;
    /** `{combo}` plus the digit family it stands for. */
    comboOption: string;
    /** `{action}` and `{field}` — the select's own name. */
    comboAriaLabel: string;
    titleLabel: string;
    titlePlaceholder: string;
    promptLabel: string;
    promptPlaceholder: string;
    remove: string;
    empty: string;
    /** `{limit}` — there is no digit left for one more. */
    atLimit: string;
  };
  hotkeys: {
    /** Shown on the button while it is waiting for the next keystroke. */
    capturing: string;
    unassignedCombo: string;
    /** `{combo}` the reset button puts back. */
    reset: string;
    /** `{combo}` and `{action}` it was taken from. */
    stolen: string;
  };
  window: {
    title: string;
    description: string;
    pairs: Record<WindowPairKey, string>;
    /** `{combo}` plus the arrow family it stands for. */
    modifierOption: string;
    /** `{action}` — which pair's modifier this select sets. */
    modifierAriaLabel: string;
    /** `{action}` — which pair's step this slider sets. */
    stepAriaLabel: string;
  };
}
