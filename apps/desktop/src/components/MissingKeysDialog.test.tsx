import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const openExternal = vi.fn<(url: string) => Promise<void>>(() => Promise.resolve());
vi.mock("@/ipc/commands", () => ({
  openExternal: (url: string) => openExternal(url),
}));

import { missingApiKeys } from "@/lib/api-keys";
import { MissingKeysDialog } from "./MissingKeysDialog";

const BOTH_MISSING = missingApiKeys({ anthropic_api_key: "", groq_api_key: "" });

const noop = () => undefined;

beforeEach(() => {
  openExternal.mockClear();
});

afterEach(cleanup);

describe("MissingKeysDialog", () => {
  it("показывает строку для каждого недостающего ключа", () => {
    render(<MissingKeysDialog open missing={BOTH_MISSING} onOpenSettings={noop} onClose={noop} />);
    screen.getByText("Ключ Anthropic");
    screen.getByText("Ключ Groq");
  });

  it("«Получить ключ» открывает консоль провайдера во внешнем браузере", () => {
    render(<MissingKeysDialog open missing={BOTH_MISSING} onOpenSettings={noop} onClose={noop} />);
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
        onOpenSettings={onOpenSettings}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByText("Открыть настройки"));
    expect(onOpenSettings).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByText("Позже"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("закрыт при open=false", () => {
    render(
      <MissingKeysDialog
        open={false}
        missing={BOTH_MISSING}
        onOpenSettings={noop}
        onClose={noop}
      />,
    );
    expect(screen.queryByText("Не хватает API-ключей")).toBeNull();
  });
});
