import { describe, expect, it } from "vitest";
import { missingApiKeys, missingKeysNotice } from "./api-keys";
import { STT_PROVIDER_GROQ, STT_PROVIDER_OPENAI } from "./stt-providers";

const keys = (
  anthropic: string,
  groq: string,
  accessToken = "",
  sttProvider: string = STT_PROVIDER_GROQ,
  openai = "",
) => ({
  anthropic_api_key: anthropic,
  groq_api_key: groq,
  openai_api_key: openai,
  access_token: accessToken,
  stt_provider: sttProvider,
});

describe("missingApiKeys", () => {
  it("оба ключа заданы — ничего не отсутствует", () => {
    expect(missingApiKeys(keys("sk-ant-x", "gsk_y"))).toEqual([]);
  });

  it("оба ключа пустые — отсутствуют оба, Anthropic первым", () => {
    const missing = missingApiKeys(keys("", ""));
    expect(missing.map((k) => k.id)).toEqual(["anthropic", "groq"]);
  });

  it("нет только одного ключа", () => {
    expect(missingApiKeys(keys("sk-ant-x", "")).map((k) => k.id)).toEqual(["groq"]);
    expect(missingApiKeys(keys("", "gsk_y")).map((k) => k.id)).toEqual(["anthropic"]);
  });

  it("провайдер OpenAI требует ключ OpenAI вместо Groq", () => {
    const missing = missingApiKeys(keys("sk-ant-x", "", "", STT_PROVIDER_OPENAI));
    expect(missing.map((k) => k.id)).toEqual(["openai"]);
  });

  it("провайдер OpenAI с ключом OpenAI не требует Groq", () => {
    expect(missingApiKeys(keys("sk-ant-x", "", "", STT_PROVIDER_OPENAI, "sk-oai"))).toEqual([]);
  });

  it("на провайдере Groq пустой ключ OpenAI не считается отсутствующим", () => {
    expect(missingApiKeys(keys("sk-ant-x", "gsk_y", "", STT_PROVIDER_GROQ, ""))).toEqual([]);
  });

  it("ключ из одних пробелов считается отсутствующим", () => {
    expect(missingApiKeys(keys("   ", "gsk_y")).map((k) => k.id)).toEqual(["anthropic"]);
  });

  it("код доступа заменяет ключи — ничего не отсутствует", () => {
    expect(missingApiKeys(keys("", "", "itk_token"))).toEqual([]);
    expect(missingApiKeys(keys("", "", "itk_token", STT_PROVIDER_OPENAI))).toEqual([]);
  });

  it("код из одних пробелов не считается активным", () => {
    expect(missingApiKeys(keys("", "", "   ")).map((k) => k.id)).toEqual(["anthropic", "groq"]);
  });

  it("у каждого ключа есть https-ссылка на консоль", () => {
    for (const k of missingApiKeys(keys("", ""))) {
      expect(k.consoleUrl).toMatch(/^https:\/\//);
    }
  });
});

describe("missingKeysNotice", () => {
  it("единственное число для одного ключа", () => {
    expect(missingKeysNotice(missingApiKeys(keys("sk-ant-x", "")))).toBe(
      "Добавьте ключ Groq или введите код доступа",
    );
  });

  it("множественное число и перечисление для двух ключей", () => {
    expect(missingKeysNotice(missingApiKeys(keys("", "")))).toBe(
      "Добавьте ключи Anthropic и Groq или введите код доступа",
    );
  });

  it("на провайдере OpenAI перечисляются Anthropic и OpenAI", () => {
    expect(missingKeysNotice(missingApiKeys(keys("", "", "", STT_PROVIDER_OPENAI)))).toBe(
      "Добавьте ключи Anthropic и OpenAI или введите код доступа",
    );
  });
});
