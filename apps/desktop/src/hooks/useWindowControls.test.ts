import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EventMap } from "@/ipc/types";

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

function keydown(init: KeyboardEventInit) {
  document.dispatchEvent(new KeyboardEvent("keydown", { ...init, bubbles: true }));
}

function renderControls(onResizeKey = vi.fn(), onOpacityStep = vi.fn(), onSend = vi.fn()) {
  renderHook(() => {
    useWindowControls([], onSend, onOpacityStep, onResizeKey);
  });
  return { onResizeKey, onOpacityStep, onSend };
}

describe("useWindowControls — opacity", () => {
  it("Cmd+Shift+Equal → onOpacityStep(1)", () => {
    const { onOpacityStep } = renderControls();
    keydown({ metaKey: true, shiftKey: true, code: "Equal" });
    expect(onOpacityStep).toHaveBeenCalledWith(1);
  });
  it("Cmd+Shift+Minus → onOpacityStep(-1)", () => {
    const { onOpacityStep } = renderControls();
    keydown({ metaKey: true, shiftKey: true, code: "Minus" });
    expect(onOpacityStep).toHaveBeenCalledWith(-1);
  });
  it("без Shift не триггерит opacity", () => {
    const { onOpacityStep } = renderControls();
    keydown({ metaKey: true, code: "Equal" });
    expect(onOpacityStep).not.toHaveBeenCalled();
  });
});

describe("useWindowControls — отправка", () => {
  it("Cmd+Enter отправляет", () => {
    const { onSend } = renderControls();
    keydown({ metaKey: true, code: "Enter" });
    expect(onSend).toHaveBeenCalled();
  });
  it("Enter без модификатора не отправляет", () => {
    const { onSend } = renderControls();
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
