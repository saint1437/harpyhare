import { useCallback, useEffect, useRef, useState } from "react";
import { getSettings, setSettings as ipcSet } from "@/ipc/commands";
import { DEFAULT_SETTINGS, type Settings } from "@/ipc/types";
import { applyOpacity, stepOpacity } from "@/lib/window-controls";

export interface SettingsApi {
  settings: Settings;
  loading: boolean;
  save: (next: Settings) => Promise<string | null>;
  bumpOpacity: (dir: 1 | -1) => void;
}

export function useSettings(): SettingsApi {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    void getSettings()
      .then((s) => {
        if (!live) return;
        setSettings(s);
        applyOpacity(document.documentElement, s.window_opacity);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);

  const save = useCallback(
    async (next: Settings): Promise<string | null> => {
      try {
        await ipcSet(next);
        const fresh = await getSettings();
        setSettings(fresh);
        applyOpacity(document.documentElement, fresh.window_opacity);
        return null;
      } catch (e) {
        applyOpacity(document.documentElement, settings.window_opacity);
        return String(e);
      }
    },
    [settings.window_opacity],
  );

  const opacityTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(
    () => () => {
      clearTimeout(opacityTimer.current);
    },
    [],
  );

  const bumpOpacity = useCallback((dir: 1 | -1) => {
    setSettings((prev) => {
      const next = stepOpacity(prev.window_opacity, dir, 0.1);
      applyOpacity(document.documentElement, next);
      const updated = { ...prev, window_opacity: next };
      clearTimeout(opacityTimer.current);
      opacityTimer.current = setTimeout(() => {
        void ipcSet(updated);
      }, 400);
      return updated;
    });
  }, []);

  return { settings, loading, save, bumpOpacity };
}
