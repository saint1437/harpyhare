import { describe, expect, it } from "vitest";
import { missingApiKeys, missingKeysNotice } from "./api-keys";

const keys = (anthropic: string, groq: string) => ({
  anthropic_api_key: anthropic,
  groq_api_key: groq,
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

  it("ключ из одних пробелов считается отсутствующим", () => {
    expect(missingApiKeys(keys("   ", "gsk_y")).map((k) => k.id)).toEqual(["anthropic"]);
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
      "Нет API-ключа Groq — отправка и распознавание отключены",
    );
  });

  it("множественное число и перечисление для двух ключей", () => {
    expect(missingKeysNotice(missingApiKeys(keys("", "")))).toBe(
      "Нет API-ключей Anthropic и Groq — отправка и распознавание отключены",
    );
  });
});
