import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useConnectivity } from "./useConnectivity";

function setOnLine(value: boolean): void {
  Object.defineProperty(navigator, "onLine", { value, configurable: true });
}

beforeEach(() => {
  setOnLine(true);
});

describe("useConnectivity", () => {
  it("navigator.onLine=true на старте → offline=false", () => {
    const { result } = renderHook(() => useConnectivity());
    expect(result.current.offline).toBe(false);
  });

  it("navigator.onLine=false на старте → offline=true", () => {
    setOnLine(false);
    const { result } = renderHook(() => useConnectivity());
    expect(result.current.offline).toBe(true);
  });

  it("ошибка конкретного API не объявляет приложение офлайн", () => {
    const { result } = renderHook(() => useConnectivity());
    act(() => {
      result.current.reportNetworkError();
    });
    expect(result.current.offline).toBe(false);
  });

  it("событие offline → offline=true", () => {
    const { result } = renderHook(() => useConnectivity());
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(result.current.offline).toBe(true);
  });

  it("событие online снимает offline без проверки конкретного API", () => {
    setOnLine(false);
    const { result } = renderHook(() => useConnectivity());
    expect(result.current.offline).toBe(true);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(result.current.offline).toBe(false);
  });
});
