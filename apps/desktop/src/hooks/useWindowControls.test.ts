import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EventMap, HotkeyBinding } from "@/ipc/types";
import { defaultCombo } from "@/lib/hotkeys";
import { PLATFORMS, type Platform } from "@/lib/platform";

const listeners = new Map<string, (payload: unknown) => void>();

vi.mock("@/ipc/events", () => ({
  onEvent: (name: string, handler: (payload: unknown) => void) => {
    listeners.set(name, handler);
    return () => listeners.delete(name);
  },
}));

import { useWindowControls } from "./useWindowControls";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  listeners.clear();
});

const PRIMARY_MODIFIER: Record<Platform, KeyboardEventInit> = {
  macos: { metaKey: true },
  windows: { ctrlKey: true },
};

function platformBindings(platform: Platform): HotkeyBinding[] {
  return (["opacity", "send", "chat_font_size"] as const).map((action) => ({
    action,
    combo: defaultCombo(action, platform),
  }));
}

function keydown(init: KeyboardEventInit) {
  document.dispatchEvent(new KeyboardEvent("keydown", { ...init, bubbles: true }));
}

function renderControls(
  bindings: HotkeyBinding[] = [],
  onResizeKey = vi.fn(),
  onOpacityStep = vi.fn(),
  onSend = vi.fn(),
  onChatFontStep = vi.fn(),
) {
  renderHook(() => {
    useWindowControls(bindings, onSend, onOpacityStep, onChatFontStep, onResizeKey);
  });
  return { onResizeKey, onOpacityStep, onSend, onChatFontStep };
}

describe.each(PLATFORMS)("useWindowControls — прозрачность (%s)", (platform) => {
  const modifier = { ...PRIMARY_MODIFIER[platform], shiftKey: true };

  it("модификатор с Equal → onOpacityStep(1)", () => {
    const { onOpacityStep } = renderControls(platformBindings(platform));
    keydown({ ...modifier, code: "Equal" });
    expect(onOpacityStep).toHaveBeenCalledWith(1);
  });

  it("модификатор с Minus → onOpacityStep(-1)", () => {
    const { onOpacityStep } = renderControls(platformBindings(platform));
    keydown({ ...modifier, code: "Minus" });
    expect(onOpacityStep).toHaveBeenCalledWith(-1);
  });

  it("без Shift не триггерит opacity", () => {
    const { onOpacityStep } = renderControls(platformBindings(platform));
    keydown({ ...PRIMARY_MODIFIER[platform], code: "Equal" });
    expect(onOpacityStep).not.toHaveBeenCalled();
  });
});

describe.each(PLATFORMS)("useWindowControls — отправка (%s)", (platform) => {
  it("дефолтное сочетание платформы отправляет", () => {
    const { onSend } = renderControls(platformBindings(platform));
    keydown({ ...PRIMARY_MODIFIER[platform], code: "Enter" });
    expect(onSend).toHaveBeenCalled();
  });

  it("Enter без модификатора не отправляет", () => {
    const { onSend } = renderControls(platformBindings(platform));
    keydown({ code: "Enter" });
    expect(onSend).not.toHaveBeenCalled();
  });
});

describe("useWindowControls — размер окна", () => {
  it("стрелки НЕ обрабатываются в JS — их владелец нативный монитор", () => {
    const { onResizeKey } = renderControls();
    keydown({ metaKey: true, shiftKey: true, code: "ArrowLeft" });
    keydown({ metaKey: true, code: "ArrowLeft" });
    expect(onResizeKey).not.toHaveBeenCalled();
  });

  it("событие resize-key от нативного монитора → onResizeKey", () => {
    const { onResizeKey } = renderControls();
    const payload: EventMap["resize-key"] = { dim: "height", dir: -1 };
    listeners.get("resize-key")?.(payload);
    expect(onResizeKey).toHaveBeenCalledWith("height", -1);
  });
});

describe.each(PLATFORMS)("useWindowControls — размер шрифта чата (%s)", (platform) => {
  const modifier = PRIMARY_MODIFIER[platform];

  it("модификатор с BracketRight увеличивает шрифт", () => {
    const { onChatFontStep } = renderControls(platformBindings(platform));
    keydown({ ...modifier, code: "BracketRight" });
    expect(onChatFontStep).toHaveBeenCalledWith(1);
  });

  it("модификатор с BracketLeft уменьшает шрифт", () => {
    const { onChatFontStep } = renderControls(platformBindings(platform));
    keydown({ ...modifier, code: "BracketLeft" });
    expect(onChatFontStep).toHaveBeenCalledWith(-1);
  });

  it("скобка без модификатора шрифт не трогает", () => {
    const { onChatFontStep } = renderControls(platformBindings(platform));
    keydown({ code: "BracketRight" });
    expect(onChatFontStep).not.toHaveBeenCalled();
  });
});
