import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const probeConnectivity = vi.fn<() => Promise<boolean>>();
type Handler = (payload: unknown) => void;
const handlers = new Map<string, Handler>();
vi.mock("@/ipc/commands", () => ({
  probeConnectivity: () => probeConnectivity(),
}));
vi.mock("@/ipc/events", () => ({
  onEvent: (name: string, handler: Handler) => {
    handlers.set(name, handler);
    return () => {
      handlers.delete(name);
    };
  },
}));

import { useConnectivity } from "./useConnectivity";

function setOnLine(value: boolean): void {
  Object.defineProperty(navigator, "onLine", { value, configurable: true });
}

beforeEach(() => {
  probeConnectivity.mockReset();
  handlers.clear();
  setOnLine(true);
});

describe("useConnectivity", () => {
  it("онлайн + успешная проба → offline=false", async () => {
    probeConnectivity.mockResolvedValue(true);
    const { result } = renderHook(() => useConnectivity());
    await waitFor(() => {
      expect(probeConnectivity).toHaveBeenCalled();
    });
    expect(result.current.offline).toBe(false);
  });

  it("navigator.onLine=false на старте → offline=true сразу", () => {
    setOnLine(false);
    probeConnectivity.mockResolvedValue(false);
    const { result } = renderHook(() => useConnectivity());
    expect(result.current.offline).toBe(true);
  });

  it("проба бросает → offline=true", async () => {
    probeConnectivity.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useConnectivity());
    await waitFor(() => {
      expect(result.current.offline).toBe(true);
    });
  });

  // Правило переехало сюда из App вместе со сводной ошибкой HUD: WKWebView
  // считает себя онлайн и при мёртвом VPN, а бэкенд — нет.
  it("код network в ошибке бэкенда поднимает offline, прочие коды — нет", async () => {
    probeConnectivity.mockResolvedValue(true);
    const { result } = renderHook(() => useConnectivity());
    await waitFor(() => {
      expect(result.current.offline).toBe(false);
    });
    act(() => {
      handlers.get("llm-error")?.({ code: "api", message: "500" });
    });
    expect(result.current.offline).toBe(false);
    act(() => {
      handlers.get("stt-error")?.({ code: "network", message: "Нет соединения" });
    });
    expect(result.current.offline).toBe(true);
  });

  it("событие offline → offline=true", async () => {
    probeConnectivity.mockResolvedValue(true);
    const { result } = renderHook(() => useConnectivity());
    await waitFor(() => {
      expect(result.current.offline).toBe(false);
    });
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(result.current.offline).toBe(true);
  });

  it("событие online перепроверяет связь и снимает offline при успехе", async () => {
    probeConnectivity.mockResolvedValueOnce(false);
    const { result } = renderHook(() => useConnectivity());
    await waitFor(() => {
      expect(result.current.offline).toBe(true);
    });
    probeConnectivity.mockResolvedValue(true);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() => {
      expect(result.current.offline).toBe(false);
    });
  });
});
