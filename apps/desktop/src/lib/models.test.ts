import { describe, expect, it } from "vitest";
import {
  curatedModels,
  DEFAULT_MODEL,
  FALLBACK_MODELS,
  modelLabel,
  selectableModels,
  thinkingLocked,
  type ModelInfo,
} from "./models";

const model = (id: string): ModelInfo => ({
  id,
  displayName: id,
  adaptive: true,
  alwaysThinks: false,
});

describe("models", () => {
  it("дефолт — haiku 4.5, он есть в фолбэк-списке", () => {
    expect(DEFAULT_MODEL).toBe("claude-haiku-4-5-20251001");
    expect(FALLBACK_MODELS.some((m) => m.id === DEFAULT_MODEL)).toBe(true);
    expect(FALLBACK_MODELS.some((m) => m.id === "claude-opus-4-8")).toBe(true);
  });

  it("modelLabel срезает бренд из display_name, иначе реконструирует из id", () => {
    expect(modelLabel({ id: "x", displayName: "Claude Sonnet 5" })).toBe("Sonnet 5");
    expect(modelLabel({ id: "claude-opus-4-8", displayName: "" })).toBe("Opus 4.8");
  });

  it("selectableModels подмешивает текущую модель, если её нет в списке", () => {
    expect(selectableModels(FALLBACK_MODELS, "claude-opus-4-8")).toBe(FALLBACK_MODELS);
    const merged = selectableModels(FALLBACK_MODELS, "claude-custom-1");
    expect(merged[0]?.id).toBe("claude-custom-1");
    expect(merged.length).toBe(FALLBACK_MODELS.length + 1);
  });

  it("curatedModels оставляет по свежайшей модели семейств opus/sonnet/haiku", () => {
    const fetched = [
      model("claude-fable-5"),
      model("claude-opus-4-8"),
      model("claude-sonnet-5"),
      model("claude-sonnet-4-6"),
      model("claude-haiku-4-5-20251001"),
      model("claude-3-5-haiku-20241022"),
    ];
    expect(curatedModels(fetched).map((m) => m.id)).toEqual([
      "claude-opus-4-8",
      "claude-sonnet-5",
      "claude-haiku-4-5-20251001",
    ]);
  });

  it("curatedModels без единого совпадения отдаёт список как есть", () => {
    const exotic = [model("claude-fable-5")];
    expect(curatedModels(exotic)).toEqual(exotic);
  });

  it("curatedModels на фолбэке — тот же фолбэк", () => {
    expect(curatedModels(FALLBACK_MODELS)).toEqual(FALLBACK_MODELS);
  });

  it("thinkingLocked: без adaptive или «думает всегда»", () => {
    expect(thinkingLocked(FALLBACK_MODELS, "claude-haiku-4-5-20251001")).toBe(true);
    expect(thinkingLocked(FALLBACK_MODELS, "claude-opus-4-8")).toBe(false);
    const withFable = [
      ...FALLBACK_MODELS,
      { id: "claude-fable-5", displayName: "Claude Fable 5", adaptive: true, alwaysThinks: true },
    ];
    expect(thinkingLocked(withFable, "claude-fable-5")).toBe(true);
    expect(thinkingLocked(FALLBACK_MODELS, "claude-unknown")).toBe(false);
  });
});
