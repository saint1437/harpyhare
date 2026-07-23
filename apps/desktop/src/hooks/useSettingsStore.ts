import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { getSettings, setSettings as ipcSet } from "@/ipc/commands";
import { DEFAULT_SETTINGS, type Settings } from "@/ipc/types";

export type ApplyVisualSettings = (settings: Settings) => void;

export interface SettingsStore {
  settings: Settings;
  setSettings: Dispatch<SetStateAction<Settings>>;
  loading: boolean;
  save: (next: Settings) => Promise<string | null>;
  reload: () => Promise<void>;
}

export function useSettingsStore(applyVisuals: ApplyVisualSettings): SettingsStore {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const applyVisualsRef = useRef(applyVisuals);
  const lastAdopted = useRef(settings);

  useEffect(() => {
    applyVisualsRef.current = applyVisuals;
  }, [applyVisuals]);

  useEffect(() => {
    lastAdopted.current = settings;
  }, [settings]);

  const adopt = useCallback((fresh: Settings) => {
    setSettings(fresh);
    applyVisualsRef.current(fresh);
  }, []);

  useEffect(() => {
    let live = true;
    void getSettings()
      .then((s) => {
        if (live) adopt(s);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [adopt]);

  const save = useCallback(
    async (next: Settings): Promise<string | null> => {
      try {
        adopt(await ipcSet(next));
        return null;
      } catch (e) {
        applyVisualsRef.current(lastAdopted.current);
        return String(e);
      }
    },
    [adopt],
  );

  const reload = useCallback(async (): Promise<void> => {
    adopt(await getSettings());
  }, [adopt]);

  return { settings, setSettings, loading, save, reload };
}
