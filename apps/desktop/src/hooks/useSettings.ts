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
import { applyChatFontSize, applyOpacity, applyTheme, stepOpacity } from "@/lib/window-controls";
import { clampWindowSize, stepWindowSize, type WindowDimension } from "@/lib/window-size";

const OPACITY_STEP = 0.1;
const OPACITY_PERSIST_DEBOUNCE_MS = 400;
const WINDOW_SIZE_PERSIST_DEBOUNCE_MS = 400;

export interface SettingsApi {
  settings: Settings;
  loading: boolean;
  save: (next: Settings) => Promise<string | null>;
  reload: () => Promise<void>;
  bumpOpacity: (dir: 1 | -1) => void;
  bumpWindowSize: (dim: WindowDimension, dir: 1 | -1) => void;
  applyNativeWindowSize: (width: number, height: number) => void;
}

function applyVisualSettings(windowOpacity: number, chatFontSize: number, theme: string): void {
  applyOpacity(document.documentElement, windowOpacity);
  applyChatFontSize(document.documentElement, chatFontSize);
  applyTheme(document.documentElement, theme);
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

function useBumpWindowSize(
  setSettings: Dispatch<SetStateAction<Settings>>,
): (dim: WindowDimension, dir: 1 | -1) => void {
  const persistTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(
    () => () => {
      clearTimeout(persistTimer.current);
    },
    [],
  );

  return useCallback(
    (dim, dir) => {
      setSettings((prev) => {
        const next = stepWindowSize(
          { width: prev.window_width, height: prev.window_height },
          dim,
          dir,
          prev.resize_step,
        );
        const updated = { ...prev, window_width: next.width, window_height: next.height };
        clearTimeout(persistTimer.current);
        persistTimer.current = setTimeout(() => {
          void ipcSet(updated);
        }, WINDOW_SIZE_PERSIST_DEBOUNCE_MS);
        return updated;
      });
    },
    [setSettings],
  );
}

function useApplyNativeWindowSize(
  setSettings: Dispatch<SetStateAction<Settings>>,
): (width: number, height: number) => void {
  const persistTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(
    () => () => {
      clearTimeout(persistTimer.current);
    },
    [],
  );

  return useCallback(
    (width, height) => {
      setSettings((prev) => {
        const next = clampWindowSize({
          width: Math.round(width),
          height: Math.round(height),
        });
        if (next.width === prev.window_width && next.height === prev.window_height) return prev;
        const updated = { ...prev, window_width: next.width, window_height: next.height };
        clearTimeout(persistTimer.current);
        persistTimer.current = setTimeout(() => {
          void ipcSet(updated);
        }, WINDOW_SIZE_PERSIST_DEBOUNCE_MS);
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
        applyVisualSettings(s.window_opacity, s.chat_font_size, s.theme);
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
        applyVisualSettings(fresh.window_opacity, fresh.chat_font_size, fresh.theme);
        return null;
      } catch (e) {
        applyVisualSettings(settings.window_opacity, settings.chat_font_size, settings.theme);
        return String(e);
      }
    },
    [settings.window_opacity, settings.chat_font_size, settings.theme],
  );

  const reload = useCallback(async (): Promise<void> => {
    const fresh = await getSettings();
    setSettings(fresh);
    applyVisualSettings(fresh.window_opacity, fresh.chat_font_size, fresh.theme);
  }, []);

  const bumpOpacity = useBumpOpacity(setSettings);
  const bumpWindowSize = useBumpWindowSize(setSettings);
  const applyNativeWindowSize = useApplyNativeWindowSize(setSettings);

  return { settings, loading, save, reload, bumpOpacity, bumpWindowSize, applyNativeWindowSize };
}
