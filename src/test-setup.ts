import { vi } from "vitest";

// @testing-library/dom calls jest.advanceTimersByTime when fake timers are enabled.
// In vitest this global doesn't exist; shim it so waitFor works with vi.useFakeTimers().
// See: https://github.com/testing-library/dom-testing-library/issues/830
(globalThis as Record<string, unknown>)["jest"] = {
  advanceTimersByTime: (ms: number) => vi.advanceTimersByTime(ms),
};
