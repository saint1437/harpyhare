import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConnectivityOverlay } from "./ConnectivityOverlay";

afterEach(() => {
  cleanup();
});

describe("ConnectivityOverlay", () => {
  it("показывает ожидание сети и кнопку повторной проверки", () => {
    const onRetry = vi.fn();
    const { getByText, getByRole } = render(<ConnectivityOverlay onRetry={onRetry} />);
    expect(getByText("Ожидается подключение к интернету")).toBeTruthy();
    expect(getByText(/VPN/)).toBeTruthy();
    fireEvent.click(getByRole("button", { name: "Проверить снова" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
