import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScreenShareIndicator } from "./ScreenShareIndicator";

afterEach(() => {
  cleanup();
});

describe("ScreenShareIndicator", () => {
  it("защищённое окно называет себя скрытым", () => {
    render(<ScreenShareIndicator visible={false} onToggle={vi.fn()} />);
    const button = screen.getByRole("button", { name: "Скрыто при демонстрации экрана" });
    expect(button.getAttribute("aria-pressed")).toBe("false");
  });

  it("незащищённое окно называет себя видимым", () => {
    render(<ScreenShareIndicator visible onToggle={vi.fn()} />);
    const button = screen.getByRole("button", { name: "Видно при демонстрации экрана" });
    expect(button.getAttribute("aria-pressed")).toBe("true");
  });

  it("подсказка объясняет, что даст нажатие", () => {
    render(<ScreenShareIndicator visible onToggle={vi.fn()} />);
    expect(screen.getByRole("button").getAttribute("title")).toContain("нажмите, чтобы скрыть");
  });

  it("клик просит переключить состояние", () => {
    const onToggle = vi.fn();
    render(<ScreenShareIndicator visible={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
