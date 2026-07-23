import { useCallback, useEffect, useState } from "react";
import { captureAvailable, requestAudioCapturePermission } from "@/ipc/commands";

export interface CapturePermission {
  permissionOk: boolean;
  requestPermission: () => Promise<void>;
}

export function useCapturePermission(): CapturePermission {
  const [permissionOk, setPermissionOk] = useState(true);

  useEffect(() => {
    void captureAvailable().then((ok) => {
      setPermissionOk(ok);
    });
  }, []);

  const requestPermission = useCallback(async () => {
    setPermissionOk(await requestAudioCapturePermission());
  }, []);

  return { permissionOk, requestPermission };
}
