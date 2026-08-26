import { useCallback, useEffect, useRef, useState } from "react";
import type { PermissionKind, PermissionsStatus } from "@/ipc/bindings";
import { openPermissionSettings, permissionsStatus, requestPermission } from "@/ipc/commands";

const UNKNOWN_STATUS: PermissionsStatus = {
  audio: "unknown",
  screen: "unknown",
  microphone: "unknown",
};

/**
 * macOS answers a TCC request asynchronously: `request_permission` returns
 * `denied` while the system dialog is still on screen, so the row used to flip to
 * «нет доступа» under the user's cursor and only a SECOND press of «Выдать»
 * — a repeat probe — could discover the truth. Nothing said so.
 *
 * So after a request we keep asking until the answer changes. The cadence is
 * deliberately unhurried: `permissions_status` for audio runs `ensure_capture`
 * once the flag is set, and building a Core Audio tap is not free (on Windows the
 * WASAPI thread can take seconds). It cannot raise a prompt, though — the
 * `*_requested` flags gate that — so polling is safe, just not cheap.
 */
const GRANT_POLL_INTERVAL_MS = 1200;
const GRANT_POLL_TIMEOUT_MS = 25_000;

export interface PermissionsApi {
  status: PermissionsStatus;
  loaded: boolean;
  audioOk: boolean;
  screenOk: boolean;
  microphoneOk: boolean;
  pending: PermissionKind | null;
  /** A request is out and the OS has not answered yet — «система спрашивает…». */
  awaiting: PermissionKind | null;
  request: (kind: PermissionKind) => Promise<void>;
  openSettings: (kind: PermissionKind) => void;
  refresh: () => Promise<void>;
}

export function usePermissions(): PermissionsApi {
  const [status, setStatus] = useState<PermissionsStatus>(UNKNOWN_STATUS);
  const [pending, setPending] = useState<PermissionKind | null>(null);
  const [awaiting, setAwaiting] = useState<PermissionKind | null>(null);
  const [loaded, setLoaded] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    const fresh = await permissionsStatus();
    if (!alive.current) return;
    setStatus(fresh);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /**
   * The canonical flow is "press «Настройки», grant in System Settings, come
   * back". Returning is a window focus, and that is the only signal we get — the
   * OS does not notify us. Without this the launcher sat on a stale answer with
   * the launch button still disabled, which is the loop the whole screen exists
   * to close.
   */
  useEffect(() => {
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  useEffect(() => {
    if (awaiting === null) return;
    const startedAt = performance.now();
    const timer = setInterval(() => {
      if (performance.now() - startedAt > GRANT_POLL_TIMEOUT_MS) {
        setAwaiting(null);
        return;
      }
      void permissionsStatus().then((fresh) => {
        if (!alive.current) return;
        setStatus(fresh);
        // Stop ONLY on success: after request_permission the *_requested flag
        // is set and the status is never "unknown" again — it reads "denied"
        // while the TCC dialog is still on screen. Exiting on "not unknown"
        // killed the wait on its first tick: the row flipped to «нет доступа»
        // under the open dialog, and a grant made in System Settings without
        // refocusing was never picked up at all. A genuine denial is closed by
        // the timeout above.
        if (fresh[awaiting] === "granted") setAwaiting(null);
      });
    }, GRANT_POLL_INTERVAL_MS);
    return () => {
      clearInterval(timer);
    };
  }, [awaiting]);

  const request = useCallback(async (kind: PermissionKind) => {
    setPending(kind);
    try {
      const state = await requestPermission(kind);
      if (!alive.current) return;
      setStatus((prev) => ({ ...prev, [kind]: state }));
      // `denied` right after a request is indistinguishable from "the dialog is
      // still open", so we wait it out rather than believing the first answer.
      if (state !== "granted") setAwaiting(kind);
    } finally {
      if (alive.current) setPending(null);
    }
  }, []);

  const openSettings = useCallback((kind: PermissionKind) => {
    void openPermissionSettings(kind);
    // Returning from System Settings fires focus, but a user who grants without
    // leaving the pane open would otherwise wait for nothing.
    setAwaiting(kind);
  }, []);

  return {
    status,
    loaded,
    audioOk: status.audio === "granted",
    screenOk: status.screen === "granted",
    microphoneOk: status.microphone === "granted",
    pending,
    awaiting,
    request,
    openSettings,
    refresh,
  };
}
