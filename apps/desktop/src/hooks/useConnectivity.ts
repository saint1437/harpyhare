import { useCallback, useEffect, useState } from "react";
import { probeConnectivity } from "@/ipc/commands";

const PROBE_INTERVAL_MS = 4000;

export interface Connectivity {
  offline: boolean;
  reportNetworkError: () => void;
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

  const reportNetworkError = useCallback(() => {
    setOffline(true);
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

  return { offline, reportNetworkError };
}
