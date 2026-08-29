import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDict } from "@/hooks/useDict";
import { applyLanguage } from "@/i18n";
import { DEFAULT_SETTINGS, type Settings } from "@/ipc/types";

const getSettings = vi.fn(() => Promise.resolve(DEFAULT_SETTINGS));
const setSettings = vi.fn((s: Settings) => Promise.resolve(s));

vi.mock("@/ipc/commands", () => ({
  getSettings: () => getSettings(),
  setSettings: (s: Settings) => setSettings(s),
  takeSettingsRecovery: () => Promise.resolve(null),
}));

import {
  applyNativeWindowSize,
  bumpOpacity,
  bumpWindowSize,
  resetSettingsState,
  saveSettings,
  useSettings,
  useSettingsBootstrap,
  useSettingsLoading,
} from "./settings";

/**
 * Which visual settings a window paints is the window's business; the store's
 * is to call whatever it registered, with the settings it just adopted. This is
 * the HUD's applier narrowed to the one thing these cases look at.
 */
const applyOpacity = vi.fn<(root: HTMLElement, value: number) => void>();
function applyVisuals(settings: Settings): void {
  applyOpacity(document.documentElement, settings.window_opacity);
}

function mount(wrapper?: typeof StrictMode) {
  return renderHook(
    () => {
      useSettingsBootstrap(applyVisuals);
      return { settings: useSettings(), loading: useSettingsLoading() };
    },
    wrapper ? { wrapper } : undefined,
  );
}

beforeEach(() => {
  getSettings.mockReset();
  setSettings.mockClear();
  applyOpacity.mockClear();
});

afterEach(() => {
  cleanup();
  resetSettingsState();
});

describe("state/settings", () => {
  it("грузит настройки и применяет прозрачность", async () => {
    getSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, window_opacity: 0.6 });
    const { result } = mount();
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.settings.window_opacity).toBe(0.6);
    expect(applyOpacity).toHaveBeenCalledWith(document.documentElement, 0.6);
  });

  it("save принимает настройки, применённые Rust'ом, без второго чтения", async () => {
    getSettings.mockResolvedValue(DEFAULT_SETTINGS);
    const { result } = mount();
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    getSettings.mockClear();
    await act(async () => {
      await saveSettings({ ...DEFAULT_SETTINGS, window_opacity: 0.4 });
    });
    expect(setSettings).toHaveBeenCalled();
    expect(getSettings).not.toHaveBeenCalled();
    expect(result.current.settings.window_opacity).toBe(0.4);
  });

  it("bumpWindowSize шагает ширину и персистит с дебаунсом", async () => {
    vi.useFakeTimers();
    getSettings.mockResolvedValue(DEFAULT_SETTINGS);
    const { result } = mount();
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    setSettings.mockClear();
    act(() => {
      bumpWindowSize("width", 1);
    });
    expect(result.current.settings.window_width).toBe(980);
    expect(result.current.settings.window_height).toBe(680);
    expect(setSettings).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(setSettings).toHaveBeenCalledTimes(1);
    expect(setSettings.mock.calls[0]?.[0]?.window_width).toBe(980);
    vi.useRealTimers();
  });

  it("bumpWindowSize клампит по минимуму ширины", async () => {
    getSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, window_width: 300 });
    const { result } = mount();
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    act(() => {
      bumpWindowSize("width", -1);
    });
    expect(result.current.settings.window_width).toBe(300);
  });

  it("bumpWindowSize шагает на resize_step, а не move_step", async () => {
    getSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, move_step: 20, resize_step: 50 });
    const { result } = mount();
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    act(() => {
      bumpWindowSize("width", 1);
    });
    expect(result.current.settings.window_width).toBe(1010);
  });

  it("applyNativeWindowSize округляет, клампит и персистит с дебаунсом", async () => {
    vi.useFakeTimers();
    getSettings.mockResolvedValue(DEFAULT_SETTINGS);
    const { result } = mount();
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    setSettings.mockClear();
    act(() => {
      applyNativeWindowSize(1000.4, 5000);
    });
    expect(result.current.settings.window_width).toBe(1000);
    expect(result.current.settings.window_height).toBe(1100);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(setSettings).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("applyNativeWindowSize игнорирует совпадающий размер", async () => {
    vi.useFakeTimers();
    getSettings.mockResolvedValue(DEFAULT_SETTINGS);
    const { result } = mount();
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    setSettings.mockClear();
    act(() => {
      applyNativeWindowSize(960, 680);
    });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(setSettings).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("bumpOpacity меняет прозрачность, применяет и персистит с дебаунсом", async () => {
    vi.useFakeTimers();
    getSettings.mockResolvedValue(DEFAULT_SETTINGS);
    const { result } = mount();
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    setSettings.mockClear();
    applyOpacity.mockClear();
    act(() => {
      bumpOpacity(-1);
    });
    expect(result.current.settings.window_opacity).toBeCloseTo(0.8);
    expect(applyOpacity).toHaveBeenCalledWith(document.documentElement, 0.8);
    expect(setSettings).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(setSettings).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("адоптирует клампнутый ответ Rust, а не то, что показал оптимистично", async () => {
    vi.useFakeTimers();
    getSettings.mockResolvedValue(DEFAULT_SETTINGS);
    // `Settings::clamp` is the contract: what comes back may not be what went out.
    setSettings.mockImplementation((s: Settings) => Promise.resolve({ ...s, window_width: 1600 }));
    const { result } = mount();
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    act(() => {
      bumpWindowSize("width", 1);
    });
    expect(result.current.settings.window_width).toBe(980);
    await act(async () => {
      vi.advanceTimersByTime(400);
      await vi.runAllTimersAsync();
    });
    expect(result.current.settings.window_width).toBe(1600);
    setSettings.mockImplementation((s: Settings) => Promise.resolve(s));
    vi.useRealTimers();
  });

  it("в StrictMode пишет ровно один раз", async () => {
    vi.useFakeTimers();
    getSettings.mockResolvedValue(DEFAULT_SETTINGS);
    const { result } = mount(StrictMode);
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    setSettings.mockClear();
    act(() => {
      bumpOpacity(-1);
    });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(setSettings).toHaveBeenCalledTimes(1);
    expect(setSettings.mock.calls[0]?.[0]?.window_opacity).toBeCloseTo(0.8);
    vi.useRealTimers();
  });

  it("серия шагов в одном батче складывается, а не перетирает себя", async () => {
    vi.useFakeTimers();
    getSettings.mockResolvedValue(DEFAULT_SETTINGS);
    const { result } = mount();
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    setSettings.mockClear();
    // A held hotkey fires several times before React re-renders once.
    act(() => {
      bumpWindowSize("width", 1);
      bumpWindowSize("width", 1);
      bumpWindowSize("width", 1);
    });
    expect(result.current.settings.window_width).toBe(1020);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(setSettings).toHaveBeenCalledTimes(1);
    expect(setSettings.mock.calls[0]?.[0]?.window_width).toBe(1020);
    vi.useRealTimers();
  });

  /**
   * Инвариант, ради которого loadLanguage вынесен ПЕРЕД adopt, а не внутрь него:
   * снапшот настроек и словарь публикуются в одном тике и приезжают одним
   * кадром. Словарь языка, которого окно ещё не показывало, — отдельный чанк
   * (`i18n/index.ts`), и достаточно дождаться его на такт позже, чтобы между
   * двумя рендерами успел показаться кадр с новыми настройками и старым языком.
   * Именно эта вспышка описана в `i18n/index.ts` как найденная запуском.
   */
  it("настройки и словарь доезжают одним кадром — языку негде мигнуть", async () => {
    applyLanguage("ru");
    getSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, language: "en" });
    const frames: string[] = [];
    const { result } = renderHook(() => {
      useSettingsBootstrap(applyVisuals);
      const settings = useSettings();
      frames.push(`${settings.language}/${useDict().locale}`);
      return settings;
    });
    try {
      await waitFor(() => {
        expect(result.current.language).toBe("en");
      });
      expect(frames.at(-1)).toBe("en/en");
      expect(frames).not.toContain("en/ru");
    } finally {
      applyLanguage("ru");
    }
  });
});
