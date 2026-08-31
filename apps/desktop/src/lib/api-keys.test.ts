import { describe, expect, it } from "vitest";
import { accessGaps, availableAnswerProviders, modelProvidersMissingKey } from "./api-keys";
import { PROVIDER_ANTHROPIC, PROVIDER_OPENAI, PROVIDER_XAI } from "./models";
import { STT_PROVIDER_GROQ, STT_PROVIDER_OPENAI } from "./stt-providers";

const keys = (
  anthropic: string,
  groq: string,
  accessToken = "",
  sttProvider: string = STT_PROVIDER_GROQ,
  openai = "",
  xai = "",
) => ({
  anthropic_api_key: anthropic,
  groq_api_key: groq,
  openai_api_key: openai,
  xai_api_key: xai,
  access_token: accessToken,
  stt_provider: sttProvider,
});

describe("accessGaps", () => {
  it("без единого ключа не хватает и ответов, и распознавания", () => {
    const gaps = accessGaps(keys("", "")).map((g) => g.kind);
    expect(gaps).toEqual(["answers", "speech"]);
  });

  it("ЛЮБОГО одного ключа ответов достаточно — Anthropic больше не обязателен", () => {
    // Ключ Groq закрывает распознавание, ключ ответов — любой из трёх.
    for (const answerKey of [
      keys("sk-ant", "gsk_y"),
      keys("", "gsk_y", "", STT_PROVIDER_GROQ, "sk-oai"),
      keys("", "gsk_y", "", STT_PROVIDER_GROQ, "", "xai-key"),
    ]) {
      expect(accessGaps(answerKey)).toEqual([]);
    }
  });

  it("ключ ответов без ключа распознавания — не хватает только речи", () => {
    const gaps = accessGaps(keys("sk-ant", ""));
    expect(gaps.map((g) => g.kind)).toEqual(["speech"]);
    expect(gaps[0]?.label).toContain("Groq");
  });

  it("подсказка про речь называет ключ выбранного провайдера", () => {
    const gaps = accessGaps(keys("sk-ant", "gsk_y", "", STT_PROVIDER_OPENAI));
    expect(gaps.map((g) => g.kind)).toEqual(["speech"]);
    expect(gaps[0]?.label).toContain("OpenAI");
  });

  it("свой ключ распознавания закрывает речь без ключа ответов того же вендора", () => {
    expect(accessGaps(keys("sk-ant", "", "", STT_PROVIDER_OPENAI, "sk-oai"))).toEqual([]);
  });

  it("код доступа закрывает обе потребности сам", () => {
    expect(accessGaps(keys("", "", "itk_token"))).toEqual([]);
  });
});

describe("availableAnswerProviders", () => {
  it("перечисляет только тех, до кого реально дотянуться", () => {
    expect(availableAnswerProviders(keys("", ""))).toEqual([]);
    expect(availableAnswerProviders(keys("sk-ant", ""))).toEqual([PROVIDER_ANTHROPIC]);
    const xaiOnly = keys("", "", "", STT_PROVIDER_GROQ, "", "xai-key");
    expect(availableAnswerProviders(xaiOnly)).toEqual([PROVIDER_XAI]);
  });

  it("код доступа открывает проксируемых, но не Grok", () => {
    const available = availableAnswerProviders(keys("", "", "itk_token"));
    expect(available).toContain(PROVIDER_ANTHROPIC);
    expect(available).toContain(PROVIDER_OPENAI);
    expect(available).not.toContain(PROVIDER_XAI);
  });
});

describe("modelProvidersMissingKey", () => {
  it("без ключей заперты все вендоры ответов", () => {
    const locked = modelProvidersMissingKey(keys("", ""));
    expect(locked).toContain(PROVIDER_ANTHROPIC);
    expect(locked).toContain(PROVIDER_OPENAI);
    expect(locked).toContain(PROVIDER_XAI);
  });

  it("код доступа открывает только тех, кого проксирует relay", () => {
    // У Grok нет роута в воркере, поэтому код доступа его НЕ открывает —
    // иначе пикер предлагал бы модель, которая ответит 404.
    const locked = modelProvidersMissingKey(keys("", "", "itk_token"));
    expect(locked).not.toContain(PROVIDER_ANTHROPIC);
    expect(locked).not.toContain(PROVIDER_OPENAI);
    expect(locked).toContain(PROVIDER_XAI);
  });

  it("свой ключ xAI открывает Grok и при коде доступа", () => {
    const withXai = keys("", "", "itk_token", STT_PROVIDER_GROQ, "", "xai-key");
    expect(modelProvidersMissingKey(withXai)).not.toContain(PROVIDER_XAI);
  });

  it("свой ключ открывает вендора без кода доступа", () => {
    const withXai = keys("", "", "", STT_PROVIDER_GROQ, "", "xai-key");
    expect(modelProvidersMissingKey(withXai)).not.toContain(PROVIDER_XAI);
  });
});
