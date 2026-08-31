import { describe, expect, it } from "vitest";
import { missingApiKeys, missingKeysNotice } from "./api-keys";

const keys = (anthropic: string, groq: string, accessToken = "", xclis = "") => ({
  anthropic_api_key: anthropic,
  xclis_api_key: xclis,
  groq_api_key: groq,
  access_token: accessToken,
});

describe("missingApiKeys", () => {
  it("Anthropic и Groq заданы — ничего не отсутствует", () => {
    expect(missingApiKeys(keys("sk-ant-x", "gsk_y"))).toEqual([]);
  });

  it("Xclis заменяет Anthropic", () => {
    expect(missingApiKeys(keys("", "gsk_y", "", "sk-xclis"))).toEqual([]);
  });

  it("оба Claude-ключа пустые и Groq пустой — отсутствуют Claude и Groq", () => {
    const missing = missingApiKeys(keys("", ""));
    expect(missing.map((k) => k.id)).toEqual(["anthropic", "groq"]);
  });

  it("нет только одного обязательного ключа", () => {
    expect(missingApiKeys(keys("sk-ant-x", "")).map((k) => k.id)).toEqual(["groq"]);
    expect(missingApiKeys(keys("", "gsk_y")).map((k) => k.id)).toEqual(["anthropic"]);
  });

  it("ключ из одних пробелов считается отсутствующим", () => {
    expect(missingApiKeys(keys("   ", "gsk_y", "", "   ")).map((k) => k.id)).toEqual([
      "anthropic",
    ]);
  });

  it("код доступа заменяет свои ключи — ничего не отсутствует", () => {
    expect(missingApiKeys(keys("", "", "itk_token"))).toEqual([]);
  });

  it("код из одних пробелов не считается активным", () => {
    expect(missingApiKeys(keys("", "", "   ")).map((k) => k.id)).toEqual([
      "anthropic",
      "groq",
    ]);
  });

  it("у каждого отсутствующего ключа есть https-ссылка", () => {
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

  it("подсказывает Anthropic или Xclis для Claude", () => {
    expect(missingKeysNotice(missingApiKeys(keys("", "")))).toBe(
      "Добавьте ключ Anthropic или Xclis и ключ Groq, либо введите код доступа",
    );
  });
});
