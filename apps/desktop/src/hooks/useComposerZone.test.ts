import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useComposerZone, type ComposerZoneRefs } from "./useComposerZone";

// A ResizeObserver the test fires by hand: jsdom has no layout, so the observed
// elements report whatever heights the test assigns to them.
let fire: (() => void) | undefined;
const originalObserver = globalThis.ResizeObserver;
class ManualResizeObserver {
  constructor(callback: ResizeObserverCallback) {
    fire = () => {
      callback([], this);
    };
  }
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

interface Heights {
  card: number;
  row: number;
  content: number;
  bar: number;
  toolbar: number;
}

function elementsWith(heights: Heights): { refs: ComposerZoneRefs; heights: Heights } {
  const make = (key: keyof Heights) => {
    const el = document.createElement("div");
    Object.defineProperty(el, "offsetHeight", { get: () => heights[key], configurable: true });
    return { current: el };
  };
  return {
    refs: {
      card: make("card"),
      row: make("row"),
      content: make("content"),
      bar: make("bar"),
      toolbar: make("toolbar"),
    },
    heights,
  };
}

const BAR_GAP = 6;

beforeEach(() => {
  globalThis.ResizeObserver = ManualResizeObserver;
});
afterEach(() => {
  globalThis.ResizeObserver = originalObserver;
  fire = undefined;
});

describe("useComposerZone", () => {
  it("пустая карточка: слот включает поле и постоянный тулбар, выноса нет", () => {
    const { refs } = elementsWith({ card: 74, row: 40, toolbar: 34, content: 120, bar: 0 });
    const onOverflow = vi.fn();
    const { result } = renderHook(() => useComposerZone(refs, false, BAR_GAP, onOverflow));
    expect(result.current).toEqual({ slot: 74, cardHeight: 74 });
    expect(onOverflow).toHaveBeenLastCalledWith(0);
  });

  it("раскрытая карточка растёт до содержимого, а вынос не включает постоянный тулбар", () => {
    const { refs, heights } = elementsWith({
      card: 74,
      row: 40,
      toolbar: 34,
      content: 120,
      bar: 24,
    });
    const onOverflow = vi.fn();
    const { result, rerender } = renderHook(
      ({ expanded }) => useComposerZone(refs, expanded, BAR_GAP, onOverflow),
      { initialProps: { expanded: false } },
    );
    expect(result.current.slot).toBe(24 + BAR_GAP + 74);
    heights.card = 120;
    rerender({ expanded: true });
    act(() => {
      fire?.();
    });
    expect(result.current).toEqual({ slot: 24 + BAR_GAP + 74, cardHeight: 120 });
    expect(onOverflow).toHaveBeenLastCalledWith(46);
  });

  it("изменение высоты тулбара меняет постоянный слот, не пряча кнопки", () => {
    const { refs, heights } = elementsWith({ card: 74, row: 40, toolbar: 34, content: 74, bar: 0 });
    const { result } = renderHook(() => useComposerZone(refs, false, BAR_GAP, vi.fn()));
    heights.toolbar = 40;
    heights.card = heights.content = 80;
    act(() => {
      fire?.();
    });
    expect(result.current).toEqual({ slot: 80, cardHeight: 80 });
  });

  it("повторный замер с теми же числами не порождает ни нового состояния, ни нового вызова", () => {
    const { refs } = elementsWith({ card: 74, row: 40, toolbar: 34, content: 120, bar: 0 });
    const onOverflow = vi.fn();
    const { result } = renderHook(() => useComposerZone(refs, false, BAR_GAP, onOverflow));
    const before = result.current;
    const calls = onOverflow.mock.calls.length;
    act(() => {
      fire?.();
    });
    expect(result.current).toBe(before);
    expect(onOverflow).toHaveBeenCalledTimes(calls);
  });

  it("без элементов ничего не меряет: композер остаётся в потоке", () => {
    const refs: ComposerZoneRefs = {
      card: { current: null },
      row: { current: null },
      content: { current: null },
      bar: { current: null },
      toolbar: { current: null },
    };
    const { result } = renderHook(() => useComposerZone(refs, true, BAR_GAP, vi.fn()));
    expect(result.current).toEqual({ slot: null, cardHeight: null });
  });
});
