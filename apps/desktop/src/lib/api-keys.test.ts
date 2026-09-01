import { describe, expect, it } from "vitest";
import {
  accessGaps,
  API_KEY_IDS,
  availableAnswerProviders,
  modelProvidersMissingKey,
  sttProvidersMissingKey,
  vendorsOutsideCode,
  visibleApiKeys,
} from "./api-keys";
import { MODEL_PROVIDERS, PROVIDER_ANTHROPIC, PROVIDER_OPENAI, PROVIDER_XAI } from "./models";
import { STT_PROVIDER_GROQ, STT_PROVIDER_OPENAI, STT_PROVIDERS } from "./stt-providers";

const keys = (
  anthropic: string,
  groq: string,
  accessToken = "",
  sttProvider: string = STT_PROVIDER_GROQ,
  openai = "",
  xai = "",
  xclis = "",
  deepgram = "",
) => ({
  anthropic_api_key: anthropic,
  groq_api_key: groq,
  openai_api_key: openai,
  xai_api_key: xai,
  xclis_api_key: xclis,
  deepgram_api_key: deepgram,
  access_token: accessToken,
  stt_provider: sttProvider,
});

describe("accessGaps", () => {
  it("без единого ключа не хватает и ответов, и распознавания", () => {
    const gaps = accessGaps(keys("", "")).map((g) => g.kind);
    expect(gaps).toEqual(["answers", "speech"]);
  });

  it("любого одного ключа ответов достаточно", () => {
    for (const answerKey of [
      keys("sk-ant", "gsk_y"),
      keys("", "gsk_y", "", STT_PROVIDER_GROQ, "sk-oai"),
      keys("", "gsk_y", "", STT_PROVIDER_GROQ, "", "xai-key"),
      keys("", "gsk_y", "", STT_PROVIDER_GROQ, "", "", "xclis-key"),
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

  it("свой ключ распознавания закрывает речь", () => {
    expect(accessGaps(keys("sk-ant", "", "", STT_PROVIDER_OPENAI, "sk-oai"))).toEqual([]);
    expect(accessGaps(keys("sk-ant", "", "", "deepgram", "", "", "", "dg-key"))).toEqual([]);
  });

  it("код доступа закрывает обе потребности на проксируемых провайдерах", () => {
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

  it("код доступа открывает только проксируемые вендоры ответов", () => {
    const available = availableAnswerProviders(keys("", "", "itk_token"));
    expect(available).toContain(PROVIDER_ANTHROPIC);
    expect(available).toContain(PROVIDER_OPENAI);
    expect(available).toContain(PROVIDER_XAI);
    expect(available).not.toContain("xclis");
  });
});

describe("modelProvidersMissingKey", () => {
  it("без ключей заперты все вендоры ответов", () => {
    const locked = modelProvidersMissingKey(keys("", ""));
    expect(locked).toEqual(MODEL_PROVIDERS.map((p) => p.id));
  });

  it("код доступа оставляет запертыми только непроксируемые вендоры", () => {
    const locked = modelProvidersMissingKey(keys("", "", "itk_token"));
    expect(locked).toEqual(MODEL_PROVIDERS.filter((p) => !p.proxied).map((p) => p.id));
    expect(locked).toContain("xclis");
  });

  it("свой ключ открывает непроксируемого вендора и при коде доступа", () => {
    const withXclis = keys("", "", "itk_token", STT_PROVIDER_GROQ, "", "", "xclis-key");
    expect(modelProvidersMissingKey(withXclis)).not.toContain("xclis");
  });
});

describe("код доступа и непроксируемые вендоры речи", () => {
  it("код доступа открывает только тех, кого проксирует relay", () => {
    const settings = keys("", "", "itk_code");
    const locked = sttProvidersMissingKey(settings);
    const proxied = STT_PROVIDERS.filter((p) => p.proxied).map((p) => p.id);
    const direct = STT_PROVIDERS.filter((p) => !p.proxied).map((p) => p.id);
    expect(proxied.every((id) => !locked.includes(id))).toBe(true);
    expect(direct.every((id) => locked.includes(id))).toBe(true);
  });

  it("Deepgram открывается своим ключом даже без кода", () => {
    const settings = keys("", "", "", "deepgram", "", "", "", "dg-key");
    expect(sttProvidersMissingKey(settings)).not.toContain("deepgram");
  });
});

describe("visibleApiKeys", () => {
  it("без кода доступа показываются все поля ключей", () => {
    expect(visibleApiKeys(keys("", ""))).toEqual(API_KEY_IDS);
  });

  it("код доступа оставляет поля только непроксируемых вендоров", () => {
    const outside = new Set(
      [...MODEL_PROVIDERS, ...STT_PROVIDERS].filter((v) => !v.proxied).map((v) => v.keyId),
    );
    expect(visibleApiKeys(keys("", "", "itk_token"))).toEqual(
      API_KEY_IDS.filter((id) => outside.has(id)),
    );
  });

  it("под кодом остаются Xclis и Deepgram", () => {
    expect(vendorsOutsideCode()).toEqual(["Xclis", "Deepgram · Nova-3"]);
    expect(visibleApiKeys(keys("", "", "itk_token"))).toEqual(["xclis", "deepgram"]);
  });
});
