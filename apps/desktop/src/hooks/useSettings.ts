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
import { applyChatFontSize, applyOpacity, stepOpacity } from "@/lib/window-controls";

const OPACITY_STEP = 0.1;
const OPACITY_PERSIST_DEBOUNCE_MS = 400;

export interface SettingsApi {
  settings: Settings;
  loading: boolean;
  save: (next: Settings) => Promise<string | null>;
  bumpOpacity: (dir: 1 | -1) => void;
}

function applyVisualSettings(windowOpacity: number, chatFontSize: number): void {
  applyOpacity(document.documentElement, windowOpacity);
  applyChatFontSize(document.documentElement, chatFontSize);
}

function useBumpOpacity(setSettings: Dispatch<SetStateAction<Settings>>): (dir: 1 | -1) => void {
  const persistTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(
    () => () => {
      clearTimeout(persistTimer.current);
    },
    [],
  );

  return useCallback(
    (dir: 1 | -1) => {
      setSettings((prev) => {
        const next = stepOpacity(prev.window_opacity, dir, OPACITY_STEP);
        applyOpacity(document.documentElement, next);
        const updated = { ...prev, window_opacity: next };
        clearTimeout(persistTimer.current);
        persistTimer.current = setTimeout(() => {
          void ipcSet(updated);
        }, OPACITY_PERSIST_DEBOUNCE_MS);
        return updated;
      });
    },
    [setSettings],
  );
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
        applyVisualSettings(s.window_opacity, s.chat_font_size);
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
        applyVisualSettings(fresh.window_opacity, fresh.chat_font_size);
        return null;
      } catch (e) {
        applyVisualSettings(settings.window_opacity, settings.chat_font_size);
        return String(e);
      }
    },
    [settings.window_opacity, settings.chat_font_size],
  );

  const bumpOpacity = useBumpOpacity(setSettings);

  return { settings, loading, save, bumpOpacity };
}
