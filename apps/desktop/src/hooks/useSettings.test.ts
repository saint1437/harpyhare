import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, type Settings } from "@/ipc/types";

const getSettings = vi.fn(() => Promise.resolve(DEFAULT_SETTINGS));
const setSettings = vi.fn((_s: Settings) => Promise.resolve());
const applyOpacity = vi.fn<(...a: unknown[]) => void>();

vi.mock("@/ipc/commands", () => ({
  getSettings: () => getSettings(),
  setSettings: (s: Settings) => setSettings(s),
}));
vi.mock("@/lib/window-controls", async (orig) => {
  const real = await orig<typeof import("@/lib/window-controls")>();
  return {
    ...real,
    applyOpacity: (...a: unknown[]) => {
      applyOpacity(...a);
    },
  };
});

import { useSettings } from "./useSettings";

beforeEach(() => {
  getSettings.mockReset();
  setSettings.mockClear();
  applyOpacity.mockClear();
});

describe("useSettings", () => {
  it("грузит настройки и применяет прозрачность", async () => {
    getSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, window_opacity: 0.6 });
    const { result } = renderHook(() => useSettings());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.settings.window_opacity).toBe(0.6);
    expect(applyOpacity).toHaveBeenCalledWith(document.documentElement, 0.6);
  });

  it("save шлёт set_settings, перечитывает и реприменяет прозрачность", async () => {
    getSettings.mockResolvedValue(DEFAULT_SETTINGS);
    const { result } = renderHook(() => useSettings());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    getSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, window_opacity: 0.4 });
    await act(async () => {
      await result.current.save({ ...DEFAULT_SETTINGS, window_opacity: 0.4 });
    });
    expect(setSettings).toHaveBeenCalled();
    expect(result.current.settings.window_opacity).toBe(0.4);
  });

  it("bumpWindowSize шагает ширину и персистит с дебаунсом", async () => {
    vi.useFakeTimers();
    getSettings.mockResolvedValue(DEFAULT_SETTINGS);
    const { result } = renderHook(() => useSettings());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    setSettings.mockClear();
    act(() => {
      result.current.bumpWindowSize("width", 1);
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
    getSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, window_width: 880 });
    const { result } = renderHook(() => useSettings());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    act(() => {
      result.current.bumpWindowSize("width", -1);
    });
    expect(result.current.settings.window_width).toBe(880);
  });

  it("bumpOpacity меняет прозрачность, применяет и персистит с дебаунсом", async () => {
    vi.useFakeTimers();
    getSettings.mockResolvedValue(DEFAULT_SETTINGS);
    const { result } = renderHook(() => useSettings());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    setSettings.mockClear();
    applyOpacity.mockClear();
    act(() => {
      result.current.bumpOpacity(-1);
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
});
