import { describe, expect, it } from "vitest";
import { missingApiKeys, missingKeysNotice } from "./api-keys";

const keys = ({
  anthropic = "",
  xclis = "",
  groq = "",
  deepgram = "",
  llmProvider = "anthropic",
  sttProvider = "groq",
  accessToken = "",
}: {
  anthropic?: string;
  xclis?: string;
  groq?: string;
  deepgram?: string;
  llmProvider?: string;
  sttProvider?: string;
  accessToken?: string;
} = {}) => ({
  anthropic_api_key: anthropic,
  xclis_api_key: xclis,
  groq_api_key: groq,
  deepgram_api_key: deepgram,
  llm_provider: llmProvider,
  stt_provider: sttProvider,
  access_token: accessToken,
});

describe("missingApiKeys", () => {
  it("оригинальная связка Anthropic + Groq готова", () => {
    expect(missingApiKeys(keys({ anthropic: "sk-ant-x", groq: "gsk_y" }))).toEqual([]);
  });

  it("альтернативная связка Xclis + Deepgram готова", () => {
    expect(
      missingApiKeys(
        keys({
          xclis: "sk-xclis",
          deepgram: "dg_key",
          llmProvider: "xclis",
          sttProvider: "deepgram",
        }),
      ),
    ).toEqual([]);
  });

  it("проверяются ключи именно выбранных провайдеров", () => {
    const missing = missingApiKeys(
      keys({
        anthropic: "sk-ant-x",
        groq: "gsk_y",
        llmProvider: "xclis",
        sttProvider: "deepgram",
      }),
    );
    expect(missing.map((k) => k.id)).toEqual(["xclis", "deepgram"]);
  });

  it("можно смешивать оригинальные и альтернативные сервисы", () => {
    expect(
      missingApiKeys(
        keys({
          xclis: "sk-xclis",
          groq: "gsk_y",
          llmProvider: "xclis",
          sttProvider: "groq",
        }),
      ),
    ).toEqual([]);
  });

  it("ключ из одних пробелов считается отсутствующим", () => {
    expect(
      missingApiKeys(keys({ anthropic: "   ", groq: "gsk_y" })).map((k) => k.id),
    ).toEqual(["anthropic"]);
  });

  it("код доступа заменяет свои ключи", () => {
    expect(missingApiKeys(keys({ accessToken: "itk_token" }))).toEqual([]);
  });

  it("у каждого отсутствующего ключа есть https-ссылка", () => {
    for (const k of missingApiKeys(keys())) {
      expect(k.consoleUrl).toMatch(/^https:\/\//);
    }
  });
});

describe("missingKeysNotice", () => {
  it("называет выбранные отсутствующие сервисы", () => {
    const missing = missingApiKeys(
      keys({ llmProvider: "xclis", sttProvider: "deepgram" }),
    );
    expect(missingKeysNotice(missing)).toBe(
      "Добавьте ключи Xclis и Deepgram для выбранных провайдеров или введите код доступа",
    );
  });

  it("единственное число для одного ключа", () => {
    const missing = missingApiKeys(keys({ anthropic: "sk-ant-x" }));
    expect(missingKeysNotice(missing)).toBe(
      "Добавьте ключ Groq для выбранных провайдеров или введите код доступа",
    );
  });
});
