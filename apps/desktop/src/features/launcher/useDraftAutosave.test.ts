import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, type Settings } from "@/ipc/types";
import { useDraftAutosave } from "./useDraftAutosave";

describe("useDraftAutosave", () => {
  it("дебаунсит сохранение draft", () => {
    vi.useFakeTimers();
    const onSave = vi.fn<(next: Settings) => void>();
    const { rerender } = renderHook(
      ({ draft }) => {
        useDraftAutosave(draft, false, onSave);
      },
      { initialProps: { draft: DEFAULT_SETTINGS } },
    );
    rerender({ draft: { ...DEFAULT_SETTINGS, window_opacity: 0.5 } });
    expect(onSave).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]?.[0]?.window_opacity).toBe(0.5);
    vi.useRealTimers();
  });

  it("на размонтировании сбрасывает несохранённый draft", () => {
    vi.useFakeTimers();
    const onSave = vi.fn<(next: Settings) => void>();
    const { rerender, unmount } = renderHook(
      ({ draft, launching }) => {
        useDraftAutosave(draft, launching, onSave);
      },
      { initialProps: { draft: DEFAULT_SETTINGS, launching: false } },
    );
    rerender({ draft: { ...DEFAULT_SETTINGS, window_opacity: 0.5 }, launching: false });
    expect(onSave).not.toHaveBeenCalled();
    unmount();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]?.[0]?.window_opacity).toBe(0.5);
    vi.useRealTimers();
  });

  it("уже сохранённый draft не пишется второй раз на размонтировании", () => {
    vi.useFakeTimers();
    const onSave = vi.fn<(next: Settings) => void>();
    const { rerender, unmount } = renderHook(
      ({ draft }) => {
        useDraftAutosave(draft, false, onSave);
      },
      { initialProps: { draft: DEFAULT_SETTINGS } },
    );
    rerender({ draft: { ...DEFAULT_SETTINGS, window_opacity: 0.5 } });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    unmount();
    expect(onSave).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("при запуске не дублирует persist — его делает onLaunch", () => {
    vi.useFakeTimers();
    const onSave = vi.fn<(next: Settings) => void>();
    const { rerender, unmount } = renderHook(
      ({ draft, launching }) => {
        useDraftAutosave(draft, launching, onSave);
      },
      { initialProps: { draft: DEFAULT_SETTINGS, launching: false } },
    );
    const edited = { ...DEFAULT_SETTINGS, window_opacity: 0.5 };
    rerender({ draft: edited, launching: false });
    rerender({ draft: edited, launching: true });
    unmount();
    expect(onSave).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
