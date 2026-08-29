import { useCallback, useEffect, useRef, useState } from "react";
import { openPermissionSettings, permissionsStatus, requestPermission } from "@/ipc/commands";
import type { PermissionKind, PermissionsStatus } from "@/ipc/types";

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

/**
 * The same cost, seen from the other side: focus is a cheap, bursty event (a
 * click back into the window, a dialog closing, the launcher regaining focus
 * after a poll tick), and it used to fire `ensure_capture` every single time,
 * with nothing stopping two probes from overlapping.
 */
const FOCUS_REFRESH_MIN_GAP_MS = 1000;

export interface PermissionsApi {
  status: PermissionsStatus;
  loaded: boolean;
  audioOk: boolean;
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
  const probing = useRef(false);
  const probedAt = useRef(0);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    probing.current = true;
    try {
      const fresh = await permissionsStatus();
      if (!alive.current) return;
      setStatus(fresh);
      setLoaded(true);
    } finally {
      probing.current = false;
      probedAt.current = performance.now();
    }
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
    const onFocus = () => {
      if (probing.current) return;
      if (performance.now() - probedAt.current < FOCUS_REFRESH_MIN_GAP_MS) return;
      void refresh();
    };
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
    microphoneOk: status.microphone === "granted",
    pending,
    awaiting,
    request,
    openSettings,
    refresh,
  };
}
