import { describe, expect, it } from "vitest";
import { DEFAULT_MODEL, MODELS, modelLabel } from "./models";

describe("models", () => {
  it("дефолт — первый в списке (opus)", () => {
    expect(DEFAULT_MODEL).toBe("claude-opus-4-8");
    expect(MODELS[0]).toBe(DEFAULT_MODEL);
  });

  it("modelLabel сокращает id до читаемого имени", () => {
    expect(modelLabel("claude-opus-4-8")).toBe("Opus 4.8");
    expect(modelLabel("claude-sonnet-4-6")).toBe("Sonnet 4.6");
    expect(modelLabel("claude-haiku-4-5")).toBe("Haiku 4.5");
  });
});
