import { getDict } from "@/i18n";
import { describe, expect, it } from "vitest";
import { missingApiKeys, missingKeysNotice, type ApiKeyPresence } from "./api-keys";

/**
 * Признаки, а не ключи: значения остались в Rust, и весь фронт рассуждает о
 * наличии. Пустая строка и строка из пробелов схлопываются там же — сюда
 * приходит уже готовый булев признак.
 */
const presence = (anthropic: boolean, groq: boolean, code = false): ApiKeyPresence => ({
  anthropic_key_set: anthropic,
  groq_key_set: groq,
  access_code_active: code,
});

describe("missingApiKeys", () => {
  it("оба ключа заданы — ничего не отсутствует", () => {
    expect(missingApiKeys(presence(true, true))).toEqual([]);
  });

  it("оба ключа пустые — отсутствуют оба, Anthropic первым", () => {
    const missing = missingApiKeys(presence(false, false));
    expect(missing.map((k) => k.id)).toEqual(["anthropic", "groq"]);
  });

  it("нет только одного ключа", () => {
    expect(missingApiKeys(presence(true, false)).map((k) => k.id)).toEqual(["groq"]);
    expect(missingApiKeys(presence(false, true)).map((k) => k.id)).toEqual(["anthropic"]);
  });

  it("код доступа заменяет оба ключа — ничего не отсутствует", () => {
    expect(missingApiKeys(presence(false, false, true))).toEqual([]);
  });

  it("код доступа глушит ключи, даже когда они заданы", () => {
    expect(missingApiKeys(presence(true, true, true))).toEqual([]);
  });

  it("у каждого ключа есть https-ссылка на консоль", () => {
    for (const k of missingApiKeys(presence(false, false))) {
      expect(k.consoleUrl).toMatch(/^https:\/\//);
    }
  });
});

describe("missingKeysNotice", () => {
  it("единственное число для одного ключа", () => {
    expect(missingKeysNotice(missingApiKeys(presence(true, false)), getDict())).toBe(
      "Добавьте ключ Groq или введите код доступа",
    );
  });

  it("множественное число и перечисление для двух ключей", () => {
    expect(missingKeysNotice(missingApiKeys(presence(false, false)), getDict())).toBe(
      "Добавьте ключи Anthropic и Groq или введите код доступа",
    );
  });
});
