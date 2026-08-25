import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const startWindowDrag = vi.fn(() => Promise.resolve());
vi.mock("@/ipc/commands", () => ({ startWindowDrag: () => startWindowDrag() }));

import { useOrbDrag } from "./useOrbDrag";

function mouseEvent(type: string, x: number, y: number) {
  const e = new MouseEvent(type, { bubbles: true });
  Object.defineProperty(e, "screenX", { value: x });
  Object.defineProperty(e, "screenY", { value: y });
  return e;
}
const react = (x: number, y: number, button = 0) =>
  ({ button, screenX: x, screenY: y, preventDefault: vi.fn() }) as never;

// Хук слушает window; без размонтирования слушатели прошлого теста остаются
// висеть и ловят чужие события.
afterEach(cleanup);
beforeEach(() => {
  startWindowDrag.mockClear();
});

describe("useOrbDrag", () => {
  it("щелчок без движения разворачивает окно и не тащит его", () => {
    const onClick = vi.fn();
    const { result } = renderHook(() => useOrbDrag(onClick));
    result.current.onMouseDown(react(100, 100));
    window.dispatchEvent(mouseEvent("mousemove", 101, 100));
    result.current.onClick(react(101, 100));
    expect(startWindowDrag).not.toHaveBeenCalled();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  // Позвать startDragging сразу на mousedown нельзя: жест перехватывает ОС и
  // щелчок после этого не доходит. Порог — то, что разделяет два намерения.
  it("сдвиг за порог отдаёт жест системе и гасит щелчок", () => {
    const onClick = vi.fn();
    const { result } = renderHook(() => useOrbDrag(onClick));
    result.current.onMouseDown(react(100, 100));
    window.dispatchEvent(mouseEvent("mousemove", 140, 130));
    expect(startWindowDrag).toHaveBeenCalledTimes(1);
    result.current.onClick(react(140, 130));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("перетаскивание начинается один раз за жест", () => {
    const { result } = renderHook(() => useOrbDrag(vi.fn()));
    result.current.onMouseDown(react(0, 0));
    window.dispatchEvent(mouseEvent("mousemove", 50, 50));
    window.dispatchEvent(mouseEvent("mousemove", 90, 90));
    expect(startWindowDrag).toHaveBeenCalledTimes(1);
  });

  it("правая кнопка не начинает жест", () => {
    const { result } = renderHook(() => useOrbDrag(vi.fn()));
    result.current.onMouseDown(react(0, 0, 2));
    window.dispatchEvent(mouseEvent("mousemove", 90, 90));
    expect(startWindowDrag).not.toHaveBeenCalled();
  });
});
