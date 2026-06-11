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
  it("показывает «Думает…» с растущим счётчиком секунд", () => {
    const { getByText } = render(<ThinkingIndicator />);
    expect(getByText("Думает…")).toBeTruthy();
    expect(getByText("0с")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(getByText("2с")).toBeTruthy();
  });
});
