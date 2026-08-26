import { useCallback, useEffect, useState } from "react";
import { probeConnectivity } from "@/ipc/commands";
import { onEvent } from "@/ipc/events";
import { isNetworkError } from "@/lib/errors";

const PROBE_INTERVAL_MS = 4000;

export interface Connectivity {
  offline: boolean;
}

export function useConnectivity(): Connectivity {
  const [offline, setOffline] = useState(() => !navigator.onLine);

  const check = useCallback(async () => {
    try {
      const reachable = await probeConnectivity();
      setOffline(!reachable);
    } catch {
      setOffline(true);
    }
  }, []);

  /**
   * «Нет соединения» от бэкенда — такой же признак обрыва, как событие `offline`
   * браузера, и надёжнее его: WKWebView считает себя онлайн и при мёртвом VPN.
   * Раньше это правило жило в `App`, который сверял СВОДНУЮ ошибку HUD с кодом
   * `network`; со сводной ошибкой ушло и оно, а место ему всё равно здесь.
   */
  useEffect(() => {
    const offStt = onEvent("stt-error", (err) => {
      if (isNetworkError(err)) setOffline(true);
    });
    const offLlm = onEvent("llm-error", (err) => {
      if (isNetworkError(err)) setOffline(true);
    });
    return () => {
      offStt();
      offLlm();
    };
  }, []);

  useEffect(() => {
    void check();
    const onOnline = () => void check();
    const onOffline = () => {
      setOffline(true);
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [check]);

  useEffect(() => {
    if (!offline) return;
    const timer = setInterval(() => void check(), PROBE_INTERVAL_MS);
    return () => {
      clearInterval(timer);
    };
  }, [offline, check]);

  return { offline };
}
