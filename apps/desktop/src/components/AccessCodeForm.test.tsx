import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccessCodeForm } from "./AccessCodeForm";

afterEach(cleanup);

const PLACEHOLDER = "XXXXX-XXXXX-XXXXX-XXXXX";

describe("AccessCodeForm", () => {
  it("кнопка выключена, пока код пуст или из одной пунктуации", () => {
    render(<AccessCodeForm onRedeem={() => Promise.resolve(null)} />);
    const button = screen.getByText<HTMLButtonElement>("Активировать");
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText(PLACEHOLDER), { target: { value: "---" } });
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText(PLACEHOLDER), { target: { value: "abc" } });
    expect(button.disabled).toBe(false);
  });

  it("передаёт введённый код в onRedeem и очищает поле при успехе", async () => {
    const onRedeem = vi.fn<(code: string) => Promise<string | null>>(() => Promise.resolve(null));
    render(<AccessCodeForm onRedeem={onRedeem} />);
    const input = screen.getByPlaceholderText<HTMLInputElement>(PLACEHOLDER);
    fireEvent.change(input, { target: { value: "code-1" } });
    fireEvent.click(screen.getByText("Активировать"));
    await waitFor(() => {
      expect(onRedeem).toHaveBeenCalledWith("code-1");
    });
    await waitFor(() => {
      expect(input.value).toBe("");
    });
  });

  it("показывает ошибку и сохраняет введённый код", async () => {
    const onRedeem = () => Promise.resolve<string | null>("Код недействителен");
    render(<AccessCodeForm onRedeem={onRedeem} />);
    const input = screen.getByPlaceholderText<HTMLInputElement>(PLACEHOLDER);
    fireEvent.change(input, { target: { value: "wrong-1" } });
    fireEvent.click(screen.getByText("Активировать"));
    await screen.findByText("Код недействителен");
    expect(input.value).toBe("wrong-1");
  });

  it("не запускает повторную активацию, пока первая в процессе", async () => {
    let resolveRedeem: (value: string | null) => void = () => undefined;
    const onRedeem = vi.fn<(code: string) => Promise<string | null>>(
      () =>
        new Promise<string | null>((resolve) => {
          resolveRedeem = resolve;
        }),
    );
    render(<AccessCodeForm onRedeem={onRedeem} />);
    fireEvent.change(screen.getByPlaceholderText(PLACEHOLDER), { target: { value: "code-1" } });
    fireEvent.click(screen.getByText("Активировать"));
    const pending = await screen.findByText("Активация…");
    fireEvent.click(pending);
    resolveRedeem(null);
    await waitFor(() => {
      expect(onRedeem).toHaveBeenCalledTimes(1);
    });
  });
});
