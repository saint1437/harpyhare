import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/ipc/commands", () => ({
  moveWindowBy: vi.fn(() => Promise.resolve()),
}));

import { useWindowControls } from "./useWindowControls";

afterEach(() => {
  vi.clearAllMocks();
});

function keydown(init: KeyboardEventInit) {
  document.dispatchEvent(new KeyboardEvent("keydown", { ...init, bubbles: true }));
}

describe("useWindowControls — opacity", () => {
  it("Cmd+Shift+Equal → onOpacityStep(1)", () => {
    const onOpacityStep = vi.fn<(dir: 1 | -1) => void>();
    renderHook(() => {
      useWindowControls(20, vi.fn(), onOpacityStep);
    });
    keydown({ metaKey: true, shiftKey: true, code: "Equal" });
    expect(onOpacityStep).toHaveBeenCalledWith(1);
  });
  it("Cmd+Shift+Minus → onOpacityStep(-1)", () => {
    const onOpacityStep = vi.fn<(dir: 1 | -1) => void>();
    renderHook(() => {
      useWindowControls(20, vi.fn(), onOpacityStep);
    });
    keydown({ metaKey: true, shiftKey: true, code: "Minus" });
    expect(onOpacityStep).toHaveBeenCalledWith(-1);
  });
  it("без Shift не триггерит opacity", () => {
    const onOpacityStep = vi.fn<(dir: 1 | -1) => void>();
    renderHook(() => {
      useWindowControls(20, vi.fn(), onOpacityStep);
    });
    keydown({ metaKey: true, code: "Equal" });
    expect(onOpacityStep).not.toHaveBeenCalled();
  });
});
