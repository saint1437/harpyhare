import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyLanguage, dictionary, format } from "@/i18n";
import { ThinkingIndicator } from "./ThinkingIndicator";

const copy = dictionary("ru").hud.thinking;
const afterSeconds = (seconds: number) => format(copy.seconds, { seconds: String(seconds) });

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  applyLanguage("ru");
});

describe("ThinkingIndicator", () => {
  it("показывает «Думает…» и растит счётчик каждую секунду", () => {
    const { getByText } = render(<ThinkingIndicator startedAt={Date.now()} />);
    expect(getByText(copy.label)).toBeTruthy();
    expect(getByText(afterSeconds(0))).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(getByText(afterSeconds(2))).toBeTruthy();
  });

  it("считает от startedAt, а не от маунта (устойчив к переключению вкладок)", () => {
    const { getByText } = render(<ThinkingIndicator startedAt={Date.now() - 5000} />);
    expect(getByText(afterSeconds(5))).toBeTruthy();
  });

  it("после минуты показывает минуты и секунды", () => {
    const { getByText } = render(<ThinkingIndicator startedAt={Date.now() - 65000} />);
    expect(getByText(format(copy.minutes, { minutes: "1", seconds: "5" }))).toBeTruthy();
  });

  it("на английском счётчик считает в тех же единицах, но своими буквами", () => {
    applyLanguage("en");
    const en = dictionary("en").hud.thinking;
    const { getByText } = render(<ThinkingIndicator startedAt={Date.now() - 65000} />);
    expect(getByText(en.label)).toBeTruthy();
    expect(getByText(format(en.minutes, { minutes: "1", seconds: "5" }))).toBeTruthy();
  });
});
