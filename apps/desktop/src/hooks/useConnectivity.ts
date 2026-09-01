import { useCallback, useEffect, useState } from "react";

export interface Connectivity {
  offline: boolean;
  reportNetworkError: () => void;
  retry: () => void;
}

export function useConnectivity(): Connectivity {
  const [offline, setOffline] = useState(() => !navigator.onLine);

  // A vendor being unreachable is not the same thing as the computer being
  // offline. In particular, VPN/routing policy can affect one API while the
  // rest of the internet keeps working. Service errors stay on the request.
  const reportNetworkError = useCallback(() => {
    return;
  }, []);

  const retry = useCallback(() => {
    setOffline(!navigator.onLine);
  }, []);

  useEffect(() => {
    const onOnline = () => {
      setOffline(false);
    };
    const onOffline = () => {
      setOffline(true);
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  return { offline, reportNetworkError, retry };
}
