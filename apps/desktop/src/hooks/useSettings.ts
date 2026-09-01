import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import { useLatestRef } from "@/hooks/useLatestRef";
import { useSettingsStore } from "@/hooks/useSettingsStore";
import { setSettings as ipcSet } from "@/ipc/commands";
import type { Settings } from "@/ipc/types";
import {
  applyChatFontSize,
  applyOpacity,
  CHAT_FONT_SIZE_HOTKEY_STEP_PX,
  applyTheme,
  stepChatFontSize,
  stepOpacity,
} from "@/lib/window-controls";
import { clampWindowSize, stepWindowSize, type WindowDimension } from "@/lib/window-size";

const OPACITY_STEP = 0.1;
const SETTINGS_PERSIST_DEBOUNCE_MS = 400;

export interface SettingsApi {
  settings: Settings;
  loading: boolean;
  save: (next: Settings) => Promise<string | null>;
  bumpOpacity: (dir: 1 | -1) => void;
  bumpChatFontSize: (dir: 1 | -1) => void;
  bumpWindowSize: (dim: WindowDimension, dir: 1 | -1) => void;
  applyNativeWindowSize: (width: number, height: number) => void;
  flush: () => Promise<void>;
}

function applyVisualSettings(settings: Settings): void {
  applyOpacity(document.documentElement, settings.window_opacity);
  applyChatFontSize(document.documentElement, settings.chat_font_size);
  applyTheme(document.documentElement, settings.theme);
}

type SettingsPatch = Partial<Settings>;

function useDebouncedSettingsPersist(latest: RefObject<Settings>): {
  schedule: (patch: SettingsPatch) => void;
  takePending: () => SettingsPatch | null;
  flush: () => Promise<void>;
} {
  const persistTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef<SettingsPatch | null>(null);

  const takePending = useCallback((): SettingsPatch | null => {
    clearTimeout(persistTimer.current);
    persistTimer.current = undefined;
    const patch = pending.current;
    pending.current = null;
    return patch;
  }, []);

  const flush = useCallback((): Promise<void> => {
    const patch = takePending();
    if (patch === null) return Promise.resolve();
    return ipcSet({ ...latest.current, ...patch }).then(() => undefined);
  }, [takePending, latest]);

  const schedule = useCallback(
    (patch: SettingsPatch) => {
      pending.current = { ...pending.current, ...patch };
      clearTimeout(persistTimer.current);
      persistTimer.current = setTimeout(() => {
        void flush();
      }, SETTINGS_PERSIST_DEBOUNCE_MS);
    },
    [flush],
  );

  useEffect(
    () => () => {
      void flush();
    },
    [flush],
  );

  return { schedule, takePending, flush };
}

function useBumpOpacity(
  setSettings: Dispatch<SetStateAction<Settings>>,
  schedulePersist: (patch: Partial<Settings>) => void,
): (dir: 1 | -1) => void {
  return useCallback(
    (dir: 1 | -1) => {
      setSettings((prev) => {
        const next = stepOpacity(prev.window_opacity, dir, OPACITY_STEP);
        applyOpacity(document.documentElement, next);
        schedulePersist({ window_opacity: next });
        return { ...prev, window_opacity: next };
      });
    },
    [setSettings, schedulePersist],
  );
}

function useBumpChatFontSize(
  setSettings: Dispatch<SetStateAction<Settings>>,
  schedulePersist: (patch: Partial<Settings>) => void,
): (dir: 1 | -1) => void {
  return useCallback(
    (dir: 1 | -1) => {
      setSettings((prev) => {
        const next = stepChatFontSize(prev.chat_font_size, dir, CHAT_FONT_SIZE_HOTKEY_STEP_PX);
        applyChatFontSize(document.documentElement, next);
        schedulePersist({ chat_font_size: next });
        return { ...prev, chat_font_size: next };
      });
    },
    [setSettings, schedulePersist],
  );
}

function useBumpWindowSize(
  setSettings: Dispatch<SetStateAction<Settings>>,
  schedulePersist: (patch: Partial<Settings>) => void,
): (dim: WindowDimension, dir: 1 | -1) => void {
  return useCallback(
    (dim, dir) => {
      setSettings((prev) => {
        const next = stepWindowSize(
          { width: prev.window_width, height: prev.window_height },
          dim,
          dir,
          prev.resize_step,
        );
        schedulePersist({ window_width: next.width, window_height: next.height });
        return { ...prev, window_width: next.width, window_height: next.height };
      });
    },
    [setSettings, schedulePersist],
  );
}

function useApplyNativeWindowSize(
  setSettings: Dispatch<SetStateAction<Settings>>,
  schedulePersist: (patch: Partial<Settings>) => void,
): (width: number, height: number) => void {
  return useCallback(
    (width, height) => {
      setSettings((prev) => {
        const next = clampWindowSize({
          width: Math.round(width),
          height: Math.round(height),
        });
        if (next.width === prev.window_width && next.height === prev.window_height) return prev;
        schedulePersist({ window_width: next.width, window_height: next.height });
        return { ...prev, window_width: next.width, window_height: next.height };
      });
    },
    [setSettings, schedulePersist],
  );
}

export function useSettings(): SettingsApi {
  const {
    settings,
    setSettings,
    loading,
    save: persistNow,
  } = useSettingsStore(applyVisualSettings);
  const latestSettings = useLatestRef(settings);
  const { schedule, takePending, flush } = useDebouncedSettingsPersist(latestSettings);

  const save = useCallback(
    async (next: Settings): Promise<string | null> => {
      const queued = takePending();
      return persistNow(queued === null ? next : { ...next, ...queued });
    },
    [takePending, persistNow],
  );

  const bumpOpacity = useBumpOpacity(setSettings, schedule);
  const bumpChatFontSize = useBumpChatFontSize(setSettings, schedule);
  const bumpWindowSize = useBumpWindowSize(setSettings, schedule);
  const applyNativeWindowSize = useApplyNativeWindowSize(setSettings, schedule);

  return {
    settings,
    loading,
    save,
    bumpOpacity,
    bumpChatFontSize,
    bumpWindowSize,
    applyNativeWindowSize,
    flush,
  };
}
