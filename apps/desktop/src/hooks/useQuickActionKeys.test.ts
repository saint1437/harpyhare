import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultCombo } from "@/lib/hotkeys";
import { PLATFORMS, type Platform } from "@/lib/platform";
import { useQuickActionKeys } from "./useQuickActionKeys";

const KEYDOWN = "keydown";
const QUICK_ACTION = "quick_action";
const ACTION_COUNT = 2;
const NO_COMBO = "";

const PRIMARY_MODIFIER: Record<Platform, KeyboardEventInit> = {
  macos: { metaKey: true },
  windows: { ctrlKey: true },
};

function keydown(init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent(KEYDOWN, { ...init, bubbles: true, cancelable: true });
  document.dispatchEvent(event);
  return event;
}

function renderKeys(combo: string, count = ACTION_COUNT) {
  const onRun = vi.fn();
  renderHook(() => {
    useQuickActionKeys(combo, count, onRun);
  });
  return onRun;
}

function watchKeydownListeners(): () => number {
  const spy = vi.spyOn(document, "addEventListener");
  return () => spy.mock.calls.filter(([type]) => type === KEYDOWN).length;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe.each(PLATFORMS)("useQuickActionKeys (%s)", (platform) => {
  const combo = defaultCombo(QUICK_ACTION, platform);
  const modifier = PRIMARY_MODIFIER[platform];

  it("автоповтор удержанной клавиши второй раз не отправляет", () => {
    const onRun = renderKeys(combo);
    keydown({ ...modifier, code: "Digit1" });
    keydown({ ...modifier, code: "Digit1", repeat: true });
    keydown({ ...modifier, code: "Digit1", repeat: true });
    expect(onRun).toHaveBeenCalledTimes(1);
  });

  it("модификатор с первой цифрой запускает первое действие", () => {
    const onRun = renderKeys(combo);
    keydown({ ...modifier, code: "Digit1" });
    expect(onRun).toHaveBeenCalledWith(0);
  });

  it("вторая цифра запускает второе действие", () => {
    const onRun = renderKeys(combo);
    keydown({ ...modifier, code: "Digit2" });
    expect(onRun).toHaveBeenCalledWith(1);
  });

  it("совпавшее сочетание гасится preventDefault", () => {
    renderKeys(combo);
    expect(keydown({ ...modifier, code: "Digit1" }).defaultPrevented).toBe(true);
  });

  it("цифра за пределом count не срабатывает и не гасится", () => {
    const onRun = renderKeys(combo);
    const event = keydown({ ...modifier, code: "Digit3" });
    expect(onRun).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("нулевая цифра действия не имеет", () => {
    const onRun = renderKeys(combo);
    keydown({ ...modifier, code: "Digit0" });
    expect(onRun).not.toHaveBeenCalled();
  });

  it("неподходящий модификатор не срабатывает", () => {
    const onRun = renderKeys(combo);
    keydown({ code: "Digit1" });
    keydown({ ...modifier, shiftKey: true, code: "Digit1" });
    expect(onRun).not.toHaveBeenCalled();
  });

  it("пустой combo не вешает слушатель", () => {
    const keydownListeners = watchKeydownListeners();
    const onRun = renderKeys(NO_COMBO);
    expect(keydownListeners()).toBe(0);
    keydown({ ...modifier, code: "Digit1" });
    expect(onRun).not.toHaveBeenCalled();
  });

  it("новая идентичность onRun не пересоздаёт подписку", () => {
    const keydownListeners = watchKeydownListeners();
    const stale = vi.fn();
    const fresh = vi.fn();
    const { rerender } = renderHook(
      ({ onRun }: { onRun: (index: number) => void }) => {
        useQuickActionKeys(combo, ACTION_COUNT, onRun);
      },
      { initialProps: { onRun: stale } },
    );
    rerender({ onRun: fresh });
    keydown({ ...modifier, code: "Digit1" });
    expect(keydownListeners()).toBe(1);
    expect(stale).not.toHaveBeenCalled();
    expect(fresh).toHaveBeenCalledWith(0);
  });
});
