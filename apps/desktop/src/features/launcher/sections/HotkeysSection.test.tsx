import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, type Settings } from "@/ipc/types";
import type { SetSetting } from "../contract";
import { HotkeysSection } from "./HotkeysSection";

const TOGGLE_HINT = "Нажмите, чтобы начать запись, и ещё раз, чтобы закончить.";
const HOLD_HINT = "Удерживайте, пока говорит собеседник.";
const TOGGLE_LABEL = "Переключатель записи";

afterEach(cleanup);

function renderSection(overrides: Partial<Settings> = {}) {
  const set = vi.fn<SetSetting>();
  render(<HotkeysSection draft={{ ...DEFAULT_SETTINGS, ...overrides }} set={set} />);
  return set;
}

describe("HotkeysSection — режим клавиши записи", () => {
  it("по умолчанию запись с удержанием: toggle выключен", () => {
    renderSection();
    expect(screen.getByRole("switch", { name: TOGGLE_LABEL }).getAttribute("aria-checked")).toBe(
      "false",
    );
    expect(screen.getByText(HOLD_HINT)).toBeTruthy();
    expect(screen.queryByText(TOGGLE_HINT)).toBeNull();
  });

  it("toggle можно явно включить: подсказка говорит про два нажатия", () => {
    renderSection({ record_toggle: true });
    expect(screen.getByText(TOGGLE_HINT)).toBeTruthy();
    expect(screen.queryByText(HOLD_HINT)).toBeNull();
  });

  it("тумблер пишет record_toggle в черновик", () => {
    const set = renderSection();
    fireEvent.click(screen.getByRole("switch", { name: TOGGLE_LABEL }));
    expect(set).toHaveBeenCalledWith("record_toggle", true);
  });
});
