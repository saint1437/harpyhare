import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { APP_MODES, DEFAULT_MODE, NOTES_MODE } from "@/lib/modes";
import { ModeSwitch } from "./ModeSwitch";

afterEach(() => {
  cleanup();
});

function renderSwitch(mode = DEFAULT_MODE) {
  const onSelect = vi.fn();
  render(<ModeSwitch mode={mode} combo="⌘⇧L" onSelect={onSelect} />);
  return onSelect;
}

describe("ModeSwitch", () => {
  it("рисует кнопку на каждый режим реестра", () => {
    renderSwitch();
    for (const mode of APP_MODES) {
      expect(screen.getByLabelText(`Режим: ${mode.label}`)).toBeTruthy();
    }
  });

  it("отмечает текущий режим нажатым", () => {
    renderSwitch();
    expect(screen.getByLabelText("Режим: Чат").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByLabelText("Режим: Заметки").getAttribute("aria-pressed")).toBe("false");
  });

  it("клик по режиму сообщает его наверх", () => {
    const onSelect = renderSwitch();
    fireEvent.click(screen.getByLabelText("Режим: Заметки"));
    expect(onSelect).toHaveBeenCalledWith(NOTES_MODE);
  });
});
