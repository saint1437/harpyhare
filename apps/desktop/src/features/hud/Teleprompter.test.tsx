import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Teleprompter } from "./Teleprompter";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const FRAME_MS = 16;
const MANY_FRAMES_MS = 1000;

function mount() {
  return render(
    <Teleprompter
      text={"строка\nещё строка"}
      initialSpeed={60}
      initialFontSize={28}
      initialOffset={0}
      onPersist={() => undefined}
      onClose={() => undefined}
      closeCombo="Escape"
      pauseCombo="Space"
    />,
  );
}

describe("Teleprompter — цикл кадров", () => {
  /**
   * jsdom не считает вёрстку, поэтому maxOffset здесь равен нулю и первый же
   * тик доводит чтение до конца и ставит паузу сам — ровно то состояние, в
   * котором цикл раньше продолжал будить главный поток шестьдесят раз в
   * секунду над окном, которое не двигается.
   */
  it("остановленный телесуфлёр не просит новых кадров", () => {
    mount();
    act(() => {
      vi.advanceTimersByTime(FRAME_MS * 3);
    });

    const frames = vi.spyOn(globalThis, "requestAnimationFrame");
    act(() => {
      vi.advanceTimersByTime(MANY_FRAMES_MS);
    });

    expect(frames).not.toHaveBeenCalled();
    frames.mockRestore();
  });
});
