import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const openExternal = vi.fn<(url: string) => Promise<void>>(() => Promise.resolve());
vi.mock("@/ipc/commands", () => ({
  openExternal: (url: string) => openExternal(url),
}));

import { missingApiKeys } from "@/lib/api-keys";
import { MissingKeysDialog } from "./MissingKeysDialog";

const BOTH_MISSING = missingApiKeys({ anthropic_api_key: "", groq_api_key: "", access_token: "" });

const noop = () => undefined;
const noRedeem = () => Promise.resolve<string | null>(null);

beforeEach(() => {
  openExternal.mockClear();
});

afterEach(cleanup);

describe("MissingKeysDialog", () => {
  it("показывает строку для каждого недостающего ключа", () => {
    render(
      <MissingKeysDialog
        open
        missing={BOTH_MISSING}
        onRedeem={noRedeem}
        onOpenSettings={noop}
        onClose={noop}
      />,
    );
    screen.getByText("Ключ Anthropic");
    screen.getByText("Ключ Groq");
  });

  it("«Получить ключ» открывает консоль провайдера во внешнем браузере", () => {
    render(
      <MissingKeysDialog
        open
        missing={BOTH_MISSING}
        onRedeem={noRedeem}
        onOpenSettings={noop}
        onClose={noop}
      />,
    );
    const [anthropicLink] = screen.getAllByText("Получить ключ");
    if (!anthropicLink) throw new Error("кнопка «Получить ключ» не найдена");
    fireEvent.click(anthropicLink);
    expect(openExternal).toHaveBeenCalledWith("https://console.anthropic.com/settings/keys");
  });

  it("«Открыть настройки» и «Позже» дёргают свои колбэки", () => {
    const onOpenSettings = vi.fn();
    const onClose = vi.fn();
    render(
      <MissingKeysDialog
        open
        missing={BOTH_MISSING}
        onRedeem={noRedeem}
        onOpenSettings={onOpenSettings}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByText("Открыть настройки"));
    expect(onOpenSettings).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByText("Позже"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("«Активировать» передаёт введённый код в onRedeem", async () => {
    const onRedeem = vi.fn<(code: string) => Promise<string | null>>(() => Promise.resolve(null));
    render(
      <MissingKeysDialog
        open
        missing={BOTH_MISSING}
        onRedeem={onRedeem}
        onOpenSettings={noop}
        onClose={noop}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("XXXXX-XXXXX-XXXXX-XXXXX"), {
      target: { value: "code-123" },
    });
    fireEvent.click(screen.getByText("Активировать"));
    await waitFor(() => {
      expect(onRedeem).toHaveBeenCalledWith("code-123");
    });
  });

  it("ошибка активации показывается пользователю", async () => {
    const onRedeem = () => Promise.resolve<string | null>("Код недействителен или уже использован");
    render(
      <MissingKeysDialog
        open
        missing={BOTH_MISSING}
        onRedeem={onRedeem}
        onOpenSettings={noop}
        onClose={noop}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("XXXXX-XXXXX-XXXXX-XXXXX"), {
      target: { value: "bad" },
    });
    fireEvent.click(screen.getByText("Активировать"));
    await screen.findByText("Код недействителен или уже использован");
  });

  it("закрыт при open=false", () => {
    render(
      <MissingKeysDialog
        open={false}
        missing={BOTH_MISSING}
        onRedeem={noRedeem}
        onOpenSettings={noop}
        onClose={noop}
      />,
    );
    expect(screen.queryByText("Нужен доступ")).toBeNull();
  });
});
