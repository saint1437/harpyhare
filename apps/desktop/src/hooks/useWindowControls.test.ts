import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EventMap } from "@/ipc/types";

const listeners = new Map<string, (payload: unknown) => void>();

vi.mock("@/ipc/commands", () => ({
  moveWindowBy: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/ipc/events", () => ({
  onEvent: (name: string, handler: (payload: unknown) => void) => {
    listeners.set(name, handler);
    return () => listeners.delete(name);
  },
}));

import { moveWindowBy } from "@/ipc/commands";
import { useWindowControls } from "./useWindowControls";

afterEach(() => {
  vi.clearAllMocks();
  listeners.clear();
});

function keydown(init: KeyboardEventInit) {
  document.dispatchEvent(new KeyboardEvent("keydown", { ...init, bubbles: true }));
}

function renderControls(onResizeKey = vi.fn(), onOpacityStep = vi.fn()) {
  renderHook(() => {
    useWindowControls(20, vi.fn(), onOpacityStep, onResizeKey);
  });
  return { onResizeKey, onOpacityStep };
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

describe("useWindowControls — resize", () => {
  it("Cmd+Shift+ArrowLeft → onResizeKey('width', -1), окно не двигается", () => {
    const { onResizeKey } = renderControls();
    keydown({ metaKey: true, shiftKey: true, code: "ArrowLeft" });
    expect(onResizeKey).toHaveBeenCalledWith("width", -1);
    expect(moveWindowBy).not.toHaveBeenCalled();
  });
  it("Cmd+Shift+ArrowDown → onResizeKey('height', 1)", () => {
    const { onResizeKey } = renderControls();
    keydown({ metaKey: true, shiftKey: true, code: "ArrowDown" });
    expect(onResizeKey).toHaveBeenCalledWith("height", 1);
  });
  it("Cmd+ArrowLeft без Shift двигает окно, а не ресайзит", () => {
    const { onResizeKey } = renderControls();
    keydown({ metaKey: true, code: "ArrowLeft" });
    expect(onResizeKey).not.toHaveBeenCalled();
    expect(moveWindowBy).toHaveBeenCalledWith(-20, 0);
  });
  it("событие resize-key от нативного монитора → onResizeKey", () => {
    const { onResizeKey } = renderControls();
    const payload: EventMap["resize-key"] = { dim: "height", dir: -1 };
    listeners.get("resize-key")?.(payload);
    expect(onResizeKey).toHaveBeenCalledWith("height", -1);
  });
});
