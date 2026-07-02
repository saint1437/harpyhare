import { describe, expect, it } from "vitest";
import {
  DEFAULT_MODEL,
  FALLBACK_MODELS,
  modelLabel,
  selectableModels,
  thinkingLocked,
} from "./models";

describe("models", () => {
  it("дефолт — opus, он есть в фолбэк-списке", () => {
    expect(DEFAULT_MODEL).toBe("claude-opus-4-8");
    expect(FALLBACK_MODELS.some((m) => m.id === DEFAULT_MODEL)).toBe(true);
  });

  it("modelLabel срезает бренд из display_name, иначе реконструирует из id", () => {
    expect(modelLabel({ id: "x", displayName: "Claude Sonnet 5" })).toBe("Sonnet 5");
    expect(modelLabel({ id: "claude-opus-4-8", displayName: "" })).toBe("Opus 4.8");
  });

  it("selectableModels подмешивает текущую модель, если её нет в списке", () => {
    expect(selectableModels(FALLBACK_MODELS, "claude-opus-4-8")).toBe(FALLBACK_MODELS);
    const merged = selectableModels(FALLBACK_MODELS, "claude-legacy-1");
    expect(merged[0]?.id).toBe("claude-legacy-1");
    expect(merged.length).toBe(FALLBACK_MODELS.length + 1);
  });

  it("thinkingLocked: без adaptive или «думает всегда»", () => {
    expect(thinkingLocked(FALLBACK_MODELS, "claude-haiku-4-5")).toBe(true); // adaptive=false
    expect(thinkingLocked(FALLBACK_MODELS, "claude-opus-4-8")).toBe(false);
    const withFable = [
      ...FALLBACK_MODELS,
      { id: "claude-fable-5", displayName: "Claude Fable 5", adaptive: true, alwaysThinks: true },
    ];
    expect(thinkingLocked(withFable, "claude-fable-5")).toBe(true);
    // неизвестная модель — не блокируем (решает Rust-гейтинг)
    expect(thinkingLocked(FALLBACK_MODELS, "claude-unknown")).toBe(false);
  });
});
