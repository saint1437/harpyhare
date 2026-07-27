import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultCombo } from "@/lib/hotkeys";
import { PLATFORMS, type Platform } from "@/lib/platform";
import { useDuplicateChatKey } from "./useDuplicateChatKey";

const KEYDOWN = "keydown";
const DUPLICATE_CHAT = "duplicate_chat";
const NO_COMBO = "";

const PRIMARY_SHIFT_MODIFIER: Record<Platform, KeyboardEventInit> = {
  macos: { metaKey: true, shiftKey: true },
  windows: { ctrlKey: true, shiftKey: true },
};

function keydown(init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent(KEYDOWN, { ...init, bubbles: true, cancelable: true });
  document.dispatchEvent(event);
  return event;
}

function renderKey(combo: string, enabled = true) {
  const onDuplicate = vi.fn();
  renderHook(() => {
    useDuplicateChatKey(combo, enabled, onDuplicate);
  });
  return onDuplicate;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe.each(PLATFORMS)("useDuplicateChatKey (%s)", (platform) => {
  const combo = defaultCombo(DUPLICATE_CHAT, platform);
  const modifier = PRIMARY_SHIFT_MODIFIER[platform];

  it("дефолтное сочетание дублирует и гасит событие", () => {
    const onDuplicate = renderKey(combo);
    const event = keydown({ ...modifier, code: "KeyN" });
    expect(onDuplicate).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("автоповтор удержанной клавиши второй раз не срабатывает", () => {
    const onDuplicate = renderKey(combo);
    keydown({ ...modifier, code: "KeyN" });
    keydown({ ...modifier, code: "KeyN", repeat: true });
    expect(onDuplicate).toHaveBeenCalledTimes(1);
  });

  it("без модификаторов и под оверлеем молчит", () => {
    const onDuplicate = renderKey(combo);
    keydown({ code: "KeyN" });
    expect(onDuplicate).not.toHaveBeenCalled();

    const gated = renderKey(combo, false);
    keydown({ ...modifier, code: "KeyN" });
    expect(gated).not.toHaveBeenCalled();
  });

  it("пустое сочетание не срабатывает никогда", () => {
    const onDuplicate = renderKey(NO_COMBO);
    keydown({ ...modifier, code: "KeyN" });
    keydown({ code: "KeyN" });
    expect(onDuplicate).not.toHaveBeenCalled();
  });
});
