import { useCallback, useEffect, useState } from "react";

export interface Connectivity {
  offline: boolean;
  reportNetworkError: () => void;
}

export function useConnectivity(): Connectivity {
  const [offline, setOffline] = useState(() => !navigator.onLine);

  // Недоступность конкретного API (Claude, Xclis, Groq и т. п.) не означает,
  // что у компьютера нет интернета. Ошибку сервиса показывает сам запрос.
  const reportNetworkError = useCallback(() => {
    return;
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

  return { offline, reportNetworkError };
}
