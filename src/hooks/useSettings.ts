import { useCallback, useEffect, useState } from "react";
import { getSettings, setSettings as ipcSet } from "@/ipc/commands";
import { DEFAULT_SETTINGS, type Settings } from "@/ipc/types";
import { applyOpacity } from "@/lib/window-controls";

export interface SettingsApi {
  settings: Settings;
  loading: boolean;
  save: (next: Settings) => Promise<string | null>;
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

  return { settings, loading, save };
}
