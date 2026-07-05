import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThinkingIndicator } from "./ThinkingIndicator";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("ThinkingIndicator", () => {
  it("показывает «Думает…» и растит счётчик каждую секунду", () => {
    const { getByText } = render(<ThinkingIndicator startedAt={Date.now()} />);
    expect(getByText("Думает…")).toBeTruthy();
    expect(getByText("0с")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(getByText("2с")).toBeTruthy();
  });

  it("считает от startedAt, а не от маунта (устойчив к переключению вкладок)", () => {
    const { getByText } = render(<ThinkingIndicator startedAt={Date.now() - 5000} />);
    expect(getByText("5с")).toBeTruthy();
  });
});
