import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyLanguage, dictionary } from "@/i18n";
import { ScreenShareIndicator } from "./ScreenShareIndicator";

const states = dictionary("ru").hud.screenShare.states;

afterEach(() => {
  cleanup();
  applyLanguage("ru");
});

describe("ScreenShareIndicator", () => {
  it("защищённое окно называет себя скрытым", () => {
    render(<ScreenShareIndicator visible={false} onToggle={vi.fn()} />);
    const button = screen.getByRole("button", { name: states.hidden.label });
    expect(button.getAttribute("aria-pressed")).toBe("false");
  });

  it("незащищённое окно называет себя видимым", () => {
    render(<ScreenShareIndicator visible onToggle={vi.fn()} />);
    const button = screen.getByRole("button", { name: states.visible.label });
    expect(button.getAttribute("aria-pressed")).toBe("true");
  });

  it("подсказка объясняет, что даст нажатие", () => {
    render(<ScreenShareIndicator visible onToggle={vi.fn()} />);
    expect(screen.getByRole("button").getAttribute("title")).toContain(states.visible.action);
  });

  it("подпись следует языку интерфейса", () => {
    applyLanguage("en");
    render(<ScreenShareIndicator visible onToggle={vi.fn()} />);
    const label = dictionary("en").hud.screenShare.states.visible.label;
    expect(screen.getByRole("button", { name: label })).not.toBeNull();
  });

  it("клик просит переключить состояние", () => {
    const onToggle = vi.fn();
    render(<ScreenShareIndicator visible={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
