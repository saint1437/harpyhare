import { useEffect, useSyncExternalStore } from "react";
import {
  clearAccessCode as ipcClearAccessCode,
  clearApiKey as ipcClearApiKey,
  getSecretsStatus,
  redeemAccessCode as ipcRedeemAccessCode,
  setApiKey as ipcSetApiKey,
} from "@/ipc/commands";
import { DEFAULT_SECRETS_STATUS, type ApiKeyKind, type SecretsStatus } from "@/ipc/types";

/**
 * The credentials slice — three booleans and two masked tails, and **never the
 * secrets themselves**.
 *
 * It is a store of its own rather than three fields of `state/settings` for the
 * reason the security audit gave: `get_settings` returned the two API keys and
 * the paid access token in plaintext on every call, into a window that renders
 * untrusted content by construction (a model answer → markdown → HTML, plus the
 * HTML preview). The values now stay in Rust; what crosses the boundary says
 * only whether something is stored.
 *
 * The second consequence is just as important and is why this is not a draft:
 * **writes go one at a time through their own commands** (`set_api_key`,
 * `clear_api_key`, `clear_access_code`), and each answers with the fresh status,
 * which is adopted here. There is no autosave of a form that could carry a stale
 * copy of a key, so the whole class of races where saving the settings wiped a
 * token that a redeem had just written cannot happen — and an empty input is
 * "leave it alone", not "erase it".
 *
 * Module scope IS per-window state, exactly as in `state/settings`: two React
 * roots in two webviews with nothing between them. Only the launcher mounts
 * this — the HUD is launched already configured and never shows a key field.
 */

interface SecretsState {
  status: SecretsStatus;
  loading: boolean;
}

const INITIAL_STATE: SecretsState = { status: DEFAULT_SECRETS_STATUS, loading: true };

let state: SecretsState = INITIAL_STATE;
const listeners = new Set<() => void>();

function publish(next: SecretsState): void {
  if (next.status === state.status && next.loading === state.loading) return;
  state = next;
  listeners.forEach((listener) => {
    listener();
  });
}

function adopt(status: SecretsStatus): void {
  publish({ ...state, status });
}

function subscribeSecrets(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getCurrentSecretsStatus(): SecretsStatus {
  return state.status;
}

/** Only for tests: module scope outlives a `cleanup()` between cases. */
export function resetSecretsState(): void {
  state = INITIAL_STATE;
}

async function loadSecretsStatus(): Promise<void> {
  try {
    adopt(await getSecretsStatus());
  } catch {
    // The defaults already on screen ("nothing is configured") are the honest
    // answer when the command itself fails, and the launcher's readiness will
    // say so. Swallowing keeps `loading` from sticking forever.
  } finally {
    publish({ ...state, loading: false });
  }
}

/**
 * «Замена, не редактирование»: an empty value is a no-op on the Rust side, so
 * the field on screen can start blank on every visit without ever erasing a
 * working key. `null` on success, the failure's text otherwise — the same shape
 * `saveSettings` uses.
 */
export async function setApiKey(kind: ApiKeyKind, value: string): Promise<string | null> {
  try {
    adopt(await ipcSetApiKey(kind, value));
    return null;
  } catch (e) {
    return String(e);
  }
}

export async function clearApiKey(kind: ApiKeyKind): Promise<string | null> {
  try {
    adopt(await ipcClearApiKey(kind));
    return null;
  } catch (e) {
    return String(e);
  }
}

export async function clearAccessCode(): Promise<string | null> {
  try {
    adopt(await ipcClearAccessCode());
    return null;
  } catch (e) {
    return String(e);
  }
}

/**
 * The redeem writes the token behind every form's back — and answers with the
 * status it produced, which is adopted here. `null` on success, the failure's
 * text otherwise.
 */
export async function redeemAccessCode(code: string): Promise<string | null> {
  const outcome = await ipcRedeemAccessCode(code);
  if ("error" in outcome) return outcome.error;
  adopt(outcome.status);
  return null;
}

export function useSecretsStatus(): SecretsStatus {
  return useSyncExternalStore(subscribeSecrets, getCurrentSecretsStatus);
}

export function useSecretsLoading(): boolean {
  return useSyncExternalStore(subscribeSecrets, () => state.loading);
}

/** Mounted once by the window's composition root, like `useSettingsBootstrap`. */
export function useSecretsBootstrap(): void {
  useEffect(() => {
    void loadSecretsStatus();
  }, []);
}
