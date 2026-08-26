import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RedeemOutcome } from "@/ipc/commands";
import { DEFAULT_SECRETS_STATUS, type ApiKeyKind, type SecretsStatus } from "@/ipc/types";

const status = (overrides: Partial<SecretsStatus> = {}): SecretsStatus => ({
  ...DEFAULT_SECRETS_STATUS,
  ...overrides,
});

const getSecretsStatus = vi.fn(() => Promise.resolve(status()));
const setApiKeyCommand = vi.fn((_kind: ApiKeyKind, _value: string) => Promise.resolve(status()));
const clearApiKeyCommand = vi.fn((_kind: ApiKeyKind) => Promise.resolve(status()));
const clearAccessCodeCommand = vi.fn(() => Promise.resolve(status()));
const redeemCommand = vi.fn((_code: string) =>
  Promise.resolve<RedeemOutcome>({ status: status() }),
);

vi.mock("@/ipc/commands", () => ({
  getSecretsStatus: () => getSecretsStatus(),
  setApiKey: (kind: ApiKeyKind, value: string) => setApiKeyCommand(kind, value),
  clearApiKey: (kind: ApiKeyKind) => clearApiKeyCommand(kind),
  clearAccessCode: () => clearAccessCodeCommand(),
  redeemAccessCode: (code: string) => redeemCommand(code),
}));

import {
  clearAccessCode,
  clearApiKey,
  redeemAccessCode,
  resetSecretsState,
  setApiKey,
  useSecretsBootstrap,
  useSecretsLoading,
  useSecretsStatus,
} from "./secrets";

function mount() {
  return renderHook(() => {
    useSecretsBootstrap();
    return { status: useSecretsStatus(), loading: useSecretsLoading() };
  });
}

beforeEach(() => {
  getSecretsStatus.mockReset();
  getSecretsStatus.mockResolvedValue(status());
  setApiKeyCommand.mockClear();
  clearApiKeyCommand.mockClear();
  clearAccessCodeCommand.mockClear();
  redeemCommand.mockClear();
  redeemCommand.mockResolvedValue({ status: status() });
});

afterEach(() => {
  cleanup();
  resetSecretsState();
});

describe("state/secrets", () => {
  /**
   * Главный тест этого модуля: во фронт приходят признаки, а не значения. Он
   * перебирает всё, что попало в состояние, и ищет образцы секретов — если
   * когда-нибудь `get_secrets_status` снова начнёт отдавать сами ключи, упадёт
   * именно здесь.
   */
  it("хранит только признаки и маски — ни одного секрета", async () => {
    getSecretsStatus.mockResolvedValue(
      status({
        anthropic_key_set: true,
        anthropic_key_hint: "sk-…9f2a",
        access_code_active: true,
      }),
    );
    const { result } = mount();
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const serialized = JSON.stringify(result.current.status);
    for (const secret of ["sk-ant-api03", "gsk_", "itk_"]) {
      expect(serialized).not.toContain(secret);
    }
    expect(result.current.status.anthropic_key_set).toBe(true);
    expect(result.current.status.anthropic_key_hint).toBe("sk-…9f2a");
  });

  it("загружает статус один раз при монтировании", async () => {
    const { result } = mount();
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(getSecretsStatus).toHaveBeenCalledTimes(1);
  });

  // Отказ самой команды не должен оставить лаунчер в вечной «Загрузке…».
  it("провалившаяся загрузка всё равно снимает флаг загрузки", async () => {
    getSecretsStatus.mockRejectedValue(new Error("нет доступа"));
    const { result } = mount();
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.status).toEqual(DEFAULT_SECRETS_STATUS);
  });

  it("сохранение ключа адоптирует ответ команды, а не гадает", async () => {
    const { result } = mount();
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    setApiKeyCommand.mockResolvedValue(
      status({ anthropic_key_set: true, anthropic_key_hint: "sk-…abcd" }),
    );

    await act(async () => {
      expect(await setApiKey("anthropic", "sk-ant-typed")).toBeNull();
    });
    expect(setApiKeyCommand).toHaveBeenCalledWith("anthropic", "sk-ant-typed");
    expect(result.current.status.anthropic_key_hint).toBe("sk-…abcd");
    // Второго round trip нет: команда сама вернула свежий статус.
    expect(getSecretsStatus).toHaveBeenCalledTimes(1);
  });

  it("удаление ключа тоже адоптирует ответ", async () => {
    const { result } = mount();
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    clearApiKeyCommand.mockResolvedValue(status({ groq_key_set: false }));

    await act(async () => {
      await clearApiKey("groq");
    });
    expect(clearApiKeyCommand).toHaveBeenCalledWith("groq");
    expect(result.current.status.groq_key_set).toBe(false);
  });

  it("отвязка кода возвращает признак в ноль", async () => {
    getSecretsStatus.mockResolvedValue(status({ access_code_active: true }));
    const { result } = mount();
    await waitFor(() => {
      expect(result.current.status.access_code_active).toBe(true);
    });
    clearAccessCodeCommand.mockResolvedValue(status({ access_code_active: false }));

    await act(async () => {
      await clearAccessCode();
    });
    expect(result.current.status.access_code_active).toBe(false);
  });

  /**
   * Токен пишет прокси за спиной формы. Статус берётся из ответа самой команды:
   * второй round trip мог бы отказать сам по себе и оставить оплаченный код
   * выглядящим непогашенным.
   */
  it("успешное погашение кода адоптирует статус из ответа команды", async () => {
    const { result } = mount();
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    redeemCommand.mockResolvedValue({ status: status({ access_code_active: true }) });

    await act(async () => {
      expect(await redeemAccessCode("XXXXX")).toBeNull();
    });
    expect(result.current.status.access_code_active).toBe(true);
    expect(getSecretsStatus).toHaveBeenCalledTimes(1);
  });

  it("неудачное погашение кода не трогает состояние и возвращает текст отказа", async () => {
    const { result } = mount();
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    redeemCommand.mockResolvedValue({ error: "Код доступа не принят" });

    await act(async () => {
      expect(await redeemAccessCode("XXXXX")).toBe("Код доступа не принят");
    });
    expect(result.current.status.access_code_active).toBe(false);
    expect(getSecretsStatus).toHaveBeenCalledTimes(1);
  });

  it("отказ команды записи возвращается текстом, а не бросается", async () => {
    const { result } = mount();
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    setApiKeyCommand.mockRejectedValue(new Error("диск только для чтения"));

    await act(async () => {
      expect(await setApiKey("groq", "gsk_x")).toContain("диск только для чтения");
    });
    expect(result.current.status.groq_key_set).toBe(false);
  });
});
