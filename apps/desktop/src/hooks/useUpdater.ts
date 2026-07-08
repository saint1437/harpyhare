import { useCallback, useEffect, useState } from "react";
import { checkForUpdate, getAppVersion, installUpdate } from "@/ipc/commands";
import { onEvent } from "@/ipc/events";
import type { UpdateInfo, UpdateProgress } from "@/ipc/types";

export type UpdaterStatus = "idle" | "available" | "downloading" | "restarting" | "error";

export interface UpdaterApi {
  status: UpdaterStatus;
  info: UpdateInfo | null;
  progress: UpdateProgress | null;
  error: string | null;
  currentVersion: string;
  install: () => void;
  checkNow: () => Promise<UpdateInfo | null>;
  dismiss: () => void;
}

const markAvailableUnlessInstalling = (status: UpdaterStatus): UpdaterStatus =>
  status === "downloading" || status === "restarting" ? status : "available";

function useCurrentAppVersion(): string {
  const [currentVersion, setCurrentVersion] = useState("");
  useEffect(() => {
    let live = true;
    void getAppVersion().then((v) => {
      if (live) setCurrentVersion(v);
    });
    return () => {
      live = false;
    };
  }, []);
  return currentVersion;
}

export function useUpdater(): UpdaterApi {
  const [status, setStatus] = useState<UpdaterStatus>("idle");
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const currentVersion = useCurrentAppVersion();

  useEffect(() => {
    const offs = [
      onEvent("update-available", (found) => {
        setInfo(found);
        setStatus(markAvailableUnlessInstalling);
      }),
      onEvent("update-progress", setProgress),
      onEvent("update-done", () => {
        setStatus("restarting");
      }),
    ];
    return () => {
      offs.forEach((off) => {
        off();
      });
    };
  }, []);

  const install = useCallback(() => {
    setStatus("downloading");
    setProgress(null);
    setError(null);
    installUpdate().catch((e: unknown) => {
      setError(String(e));
      setStatus("error");
    });
  }, []);

  const checkNow = useCallback(async (): Promise<UpdateInfo | null> => {
    const found = await checkForUpdate();
    if (found) {
      setInfo(found);
      setStatus(markAvailableUnlessInstalling);
    }
    return found;
  }, []);

  const dismiss = useCallback(() => {
    setStatus("idle");
    setInfo(null);
    setError(null);
  }, []);

  return { status, info, progress, error, currentVersion, install, checkNow, dismiss };
}
