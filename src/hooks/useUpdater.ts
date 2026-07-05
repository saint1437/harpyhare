import { useCallback, useEffect, useState } from "react";
import { checkForUpdate, getAppVersion, installUpdate } from "@/ipc/commands";
import { onEvent } from "@/ipc/events";
import type { UpdateInfo, UpdateProgress } from "@/ipc/types";

/** idle — обновления нет; error — установка сорвалась (info остаётся для ретрая). */
export type UpdaterStatus = "idle" | "available" | "downloading" | "restarting" | "error";

export interface UpdaterApi {
  status: UpdaterStatus;
  info: UpdateInfo | null;
  progress: UpdateProgress | null;
  error: string | null;
  /** Версия текущей сборки ("" вне Tauri, пока не загрузилась). */
  currentVersion: string;
  install: () => void;
  /** Ручная проверка (кнопка в настройках). null — новой версии нет. */
  checkNow: () => Promise<UpdateInfo | null>;
  /** Сбросить найденное обновление (после «Пропустить версию»). */
  dismiss: () => void;
}

/**
 * Состояние автообновления: слушает update-события Rust (автопроверка на старте
 * и раз в 6 часов — на стороне бэкенда), запускает установку. Ошибки установки
 * приходят реджектом команды install_update, отдельного события нет.
 */
export function useUpdater(): UpdaterApi {
  const [status, setStatus] = useState<UpdaterStatus>("idle");
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  useEffect(() => {
    const offs = [
      onEvent("update-available", (found) => {
        setInfo(found);
        // не перебиваем идущую установку (событие может прийти от периодической проверки)
        setStatus((s) => (s === "downloading" || s === "restarting" ? s : "available"));
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
      setStatus((s) => (s === "downloading" || s === "restarting" ? s : "available"));
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
