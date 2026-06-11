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
  it("показывает «Думает… 0с» на старте и растит счётчик каждую секунду", () => {
    const { getByText } = render(<ThinkingIndicator />);
    expect(getByText("Думает… 0с")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(getByText("Думает… 2с")).toBeTruthy();
  });
});
