import { useMemo } from "react";
import { useCapturePermission } from "@/hooks/useCapturePermission";
import type { Settings } from "@/ipc/types";
import { missingApiKeys, type ApiKeyInfo } from "@/lib/api-keys";

export interface LauncherReadiness {
  missingKeys: ApiKeyInfo[];
  permissionOk: boolean;
  ready: boolean;
  requestPermission: () => Promise<void>;
}

export function useLauncherReadiness(settings: Settings): LauncherReadiness {
  const missingKeys = useMemo(() => missingApiKeys(settings), [settings]);
  const { permissionOk, requestPermission } = useCapturePermission();

  const ready = missingKeys.length === 0 && permissionOk;
  return { missingKeys, permissionOk, ready, requestPermission };
}
