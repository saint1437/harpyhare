import { useEffect, useSyncExternalStore } from "react";
import { applyLanguage, format, getDict } from "@/i18n";
import {
  getSettings as ipcGetSettings,
  setSettings as ipcSetSettings,
  takeSettingsRecovery,
} from "@/ipc/commands";
import { DEFAULT_SETTINGS, type Settings } from "@/ipc/types";
import { notifyError } from "@/lib/notifications";
import { stepOpacity } from "@/lib/window-controls";
import { clampWindowSize, stepWindowSize, type WindowDimension } from "@/lib/window-size";

/**
 * The settings slice: one store, both windows, and NOT one shared state.
 *
 * That is not a contradiction — it is the architecture. The HUD and the
 * launcher are two React roots in two webviews with nothing between them, so
 * module scope IS per-window state (the same reasoning as `lib/notifications`
 * and `state/stream`). Each window loads settings.json for itself and each
 * writes it back; they do not synchronise, and trying to make them would mean
 * inventing a channel that does not exist.
 *
 * What the two windows genuinely share is the PROTOCOL, and it has one
 * invariant that is easy to lose: **`set_settings` returns the CLAMPED
 * settings, and the answer must be adopted.** Ignore that promise and the HUD
 * shows the number the user typed while the disk holds the number Rust allowed
 * — which is how a window that had hit `Settings::clamp` came back a different
 * size on the next launch.
 *
 * The second invariant is `saveSettingsDebounced`: the HUD's bumps (a held
 * hotkey, a native window resize) arrive in bursts and are painted
 * optimistically, so the write is debounced — but the write still goes through
 * here, and the clamped answer is still adopted, unless a newer bump landed
 * while it was in flight. A bump is a `SettingsStep` — a FUNCTION of the current
 * value, not an object — because a held hotkey fires several times inside one
 * React batch: an object built from a stale `settings` would step the window
 * once per render instead of once per press. Reading `state.settings` here is
 * always current, which is what the old hook needed a synchronously-updated ref
 * for.
 */

const SETTINGS_PERSIST_DEBOUNCE_MS = 400;

export type ApplyVisualSettings = (settings: Settings) => void;

/**
 * What one bump changes, computed from what is currently on screen.
 * `null` means "nothing to do" — an echo of a size we already hold.
 */
export type SettingsStep = (current: Settings) => Partial<Settings> | null;

interface SettingsState {
  settings: Settings;
  loading: boolean;
}

const INITIAL_STATE: SettingsState = { settings: DEFAULT_SETTINGS, loading: true };

let state: SettingsState = INITIAL_STATE;
let persistTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Which visual settings THIS window paints — the one thing about settings the
 * two windows do not agree on. The HUD is translucent and holds the chat, so it
 * paints opacity, chat font size and theme; the launcher is an ordinary opaque
 * window and paints the theme alone. Registered by the window's own root.
 */
let applyVisuals: ApplyVisualSettings = () => undefined;

const listeners = new Set<() => void>();

function publish(next: SettingsState): void {
  if (next.settings === state.settings && next.loading === state.loading) return;
  state = next;
  listeners.forEach((listener) => {
    listener();
  });
}

/**
 * The single door in. The visuals are painted on every adoption rather than on
 * every publish: a rejected write rolls them back to a value that is already
 * the current state, so there is nothing to publish and everything to repaint.
 */
function adopt(fresh: Settings): void {
  publish({ ...state, settings: fresh });
  // The language is NOT part of `applyVisuals`: that callback is what differs
  // between the two windows (the HUD paints opacity and the chat font, the
  // launcher paints the theme alone), while the dictionary is the same question
  // in both and is answered by one module store.
  applyLanguage(fresh.language);
  applyVisuals(fresh);
}

export function subscribeSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Settings outside React — event handlers and IPC callbacks read them here. */
export function getCurrentSettings(): Settings {
  return state.settings;
}

/** Only for tests: module scope outlives a `cleanup()` between cases. */
export function resetSettingsState(): void {
  clearTimeout(persistTimer);
  persistTimer = undefined;
  state = INITIAL_STATE;
  applyVisuals = () => undefined;
}

/**
 * A `settings.json` Rust could not parse is renamed aside and replaced by the
 * defaults BEFORE any window exists — which is why it is a command to collect
 * rather than an event. Reporting it is not optional: the access code the user
 * paid for lived in that file, and silently starting blank looks like the app
 * forgetting them.
 */
async function reportSettingsRecovery(): Promise<void> {
  const recovery = await takeSettingsRecovery().catch(() => null);
  if (recovery === null) return;
  const copy = getDict().common.storage;
  notifyError(
    copy.settingsRecoveryTitle,
    format(copy.settingsRecoveryDetail, { reason: recovery.reason, path: recovery.backupPath }),
  );
}

export async function loadSettings(): Promise<void> {
  try {
    adopt(await ipcGetSettings());
  } catch {
    // Rust has already replaced an unreadable settings.json with the defaults
    // (and says so through `takeSettingsRecovery`), so a rejection here is the
    // command itself failing — and the defaults already on screen are then the
    // only honest answer. Swallowing it keeps `loading` from sticking forever.
  } finally {
    publish({ ...state, loading: false });
  }
  void reportSettingsRecovery();
}

/** `null` on success, the failure's text otherwise. */
export async function saveSettings(next: Settings): Promise<string | null> {
  try {
    adopt(await ipcSetSettings(next));
    return null;
  } catch (e) {
    // The optimistic bumps have already been painted by hand; roll the DOM back
    // to what the store still holds.
    applyVisuals(state.settings);
    return String(e);
  }
}

export function saveSettingsDebounced(step: SettingsStep): void {
  const patch = step(state.settings);
  if (patch === null) return;
  const next = { ...state.settings, ...patch };
  adopt(next);

  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    void ipcSetSettings(next)
      .then((applied) => {
        // A bump that landed while the write was in flight owns the state now;
        // adopting the older clamp would undo it on screen.
        if (state.settings === next) adopt(applied);
      })
      // The bump is already on screen and in state; a failed write only leaves
      // disk behind, and the next one carries the value anyway.
      .catch(() => undefined);
  }, SETTINGS_PERSIST_DEBOUNCE_MS);
}

/* ── the HUD's bumps: pure computations of the next value ─────────────────── */

const OPACITY_STEP = 0.1;

export function bumpOpacity(dir: 1 | -1): void {
  saveSettingsDebounced((current) => ({
    window_opacity: stepOpacity(current.window_opacity, dir, OPACITY_STEP),
  }));
}

export function bumpWindowSize(dim: WindowDimension, dir: 1 | -1): void {
  saveSettingsDebounced((current) => {
    const next = stepWindowSize(
      { width: current.window_width, height: current.window_height },
      dim,
      dir,
      current.resize_step,
    );
    return { window_width: next.width, window_height: next.height };
  });
}

/**
 * The window has already been resized by the user's mouse; only the record of
 * it is ours. An echo of the size we already hold is not a change.
 */
export function applyNativeWindowSize(width: number, height: number): void {
  saveSettingsDebounced((current) => {
    const next = clampWindowSize({ width: Math.round(width), height: Math.round(height) });
    if (next.width === current.window_width && next.height === current.window_height) return null;
    return { window_width: next.width, window_height: next.height };
  });
}

/* ── selectors ────────────────────────────────────────────────────────────── */

export function useSettings(): Settings {
  return useSyncExternalStore(subscribeSettings, getCurrentSettings);
}

export function useSettingsLoading(): boolean {
  return useSyncExternalStore(subscribeSettings, () => state.loading);
}

/**
 * Starts this window's settings: registers what it paints and reads the file
 * once. Mount it in the window's composition root and nowhere else — a second
 * mount would simply re-read the same file into the same store.
 */
export function useSettingsBootstrap(applyWindowVisuals: ApplyVisualSettings): void {
  useEffect(() => {
    applyVisuals = applyWindowVisuals;
    void loadSettings();
    return () => {
      clearTimeout(persistTimer);
    };
  }, [applyWindowVisuals]);
}
