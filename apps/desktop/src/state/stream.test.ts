import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  beginStreamState,
  clearPartial,
  getStreamState,
  isStreaming,
  resetStreamState,
  setPartials,
  setStreamingFlag,
  subscribeStream,
  useIsStreaming,
  useStreamHasText,
  useStreamPartial,
  useStreamingFlags,
} from "./stream";

afterEach(resetStreamState);

describe("state/stream", () => {
  it("начало стрима ставит флаг, время и пустой текст", () => {
    beginStreamState("A", 1000);
    expect(getStreamState().streaming["A"]).toBe(true);
    expect(getStreamState().startedAt["A"]).toBe(1000);
    expect(getStreamState().partial["A"]).toBe("");
    expect(isStreaming("A")).toBe(true);
  });

  // Кадр, в котором раскрытый текст не вырос, не должен будить подписчиков:
  // снимок, который каждый раз новый объект, крутит useSyncExternalStore вечно.
  it("кадр без изменений не рассылает событие", () => {
    const listener = vi.fn();
    beginStreamState("A", 0);
    const stop = subscribeStream(listener);
    setPartials({ A: "" });
    expect(listener).not.toHaveBeenCalled();
    setPartials({ A: "при" });
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
  });

  it("снимок стабилен по ссылке, пока ничего не менялось", () => {
    beginStreamState("A", 0);
    const before = getStreamState();
    setPartials({ A: "" });
    setStreamingFlag("A", true);
    expect(getStreamState()).toBe(before);
  });

  it("два чата не смешиваются", () => {
    beginStreamState("A", 0);
    beginStreamState("B", 0);
    setPartials({ A: "первый", B: "второй" });
    expect(getStreamState().partial).toEqual({ A: "первый", B: "второй" });
  });

  it("clearPartial убирает только свой чат", () => {
    beginStreamState("A", 0);
    beginStreamState("B", 0);
    setPartials({ A: "первый", B: "второй" });
    clearPartial("A");
    expect(getStreamState().partial).toEqual({ B: "второй" });
  });

  it("отписка перестаёт получать события", () => {
    const listener = vi.fn();
    const stop = subscribeStream(listener);
    stop();
    beginStreamState("A", 0);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("селекторы", () => {
  // Главный выигрыш всей задачи: текст читает ровно один подписчик, а корень —
  // только флаги, которые меняются дважды за ответ, а не шестьдесят раз в секунду.
  it("подписчик текста просыпается на каждый кадр, подписчик флага — нет", () => {
    const textRenders = vi.fn();
    const flagRenders = vi.fn();
    renderHook(() => {
      textRenders();
      return useStreamPartial("A");
    });
    renderHook(() => {
      flagRenders();
      return useIsStreaming("A");
    });
    const textBefore = textRenders.mock.calls.length;
    const flagBefore = flagRenders.mock.calls.length;

    act(() => {
      beginStreamState("A", 0);
    });
    for (let i = 1; i <= 5; i++) {
      act(() => {
        setPartials({ A: "x".repeat(i) });
      });
    }

    expect(textRenders.mock.calls.length).toBeGreaterThan(textBefore + 4);
    // Флаг сменился один раз — на старте стрима.
    expect(flagRenders.mock.calls.length).toBeLessThanOrEqual(flagBefore + 2);
  });

  it("useStreamHasText переключается один раз за ответ", () => {
    const { result } = renderHook(() => useStreamHasText("A"));
    expect(result.current).toBe(false);
    act(() => {
      beginStreamState("A", 0);
    });
    expect(result.current).toBe(false);
    act(() => {
      setPartials({ A: "п" });
    });
    expect(result.current).toBe(true);
    act(() => {
      setPartials({ A: "привет" });
    });
    expect(result.current).toBe(true);
  });

  it("useStreamingFlags отдаёт запись целиком для точек на вкладках", () => {
    const { result } = renderHook(() => useStreamingFlags());
    act(() => {
      beginStreamState("A", 0);
      beginStreamState("B", 0);
      setStreamingFlag("B", false);
    });
    expect(result.current).toEqual({ A: true, B: false });
  });
});
