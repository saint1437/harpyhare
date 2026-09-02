import { describe, expect, it } from "vitest";
import { extractKeyterms, stripKeywordBlocks } from "./keywords";
import { BASE_SYSTEM_PROMPT } from "./system-prompt";
import { mergePresets, OFFICIAL_PRESETS_FALLBACK, presetText, type PromptPreset } from "./presets";

const presets: PromptPreset[] = [
  { id: "a", name: "A", text: "текст-A" },
  { id: "b", name: "B", text: "текст-B" },
];

const preset = (id: string, name = id): PromptPreset => ({ id, name, text: id });

describe("presetText", () => {
  it("добавляет базовые правила и текст пресета по id", () => {
    const text = presetText(presets, "b");
    expect(text).toContain(BASE_SYSTEM_PROMPT);
    expect(text).toContain("--- РЕЖИМ РАБОТЫ ---\nтекст-B");
  });
  it("неизвестный id → только базовые правила", () => {
    const text = presetText(presets, "zzz");
    expect(text).toContain(BASE_SYSTEM_PROMPT);
    expect(text).not.toContain("РЕЖИМ РАБОТЫ");
  });
  it("пустой presetId → только базовые правила", () => {
    expect(presetText(presets, "")).toContain(BASE_SYSTEM_PROMPT);
  });
});

describe("mergePresets", () => {
  it("официальные идут первыми, личные — следом", () => {
    expect(mergePresets([preset("off")], [preset("mine")])).toEqual([
      preset("off"),
      preset("mine"),
    ]);
  });
  it("официальный пресет побеждает при совпадении id", () => {
    const official = preset("transcription", "офиц");
    const local = preset("transcription", "локальный");
    expect(mergePresets([official], [local])).toEqual([official]);
  });
  it("личные без коллизий сохраняются", () => {
    expect(mergePresets([preset("a")], [preset("a"), preset("b")])).toEqual([
      preset("a"),
      preset("b"),
    ]);
  });
  it("пустой официальный пул отдаёт личные как есть", () => {
    expect(mergePresets([], [preset("x")])).toEqual([preset("x")]);
  });
});

describe("встроенные пресеты объявляют термины для распознавания", () => {
  it("у каждого пресета есть непустой блок [keywords]", () => {
    expect(OFFICIAL_PRESETS_FALLBACK.length).toBeGreaterThan(0);
    for (const preset of OFFICIAL_PRESETS_FALLBACK) {
      expect(extractKeyterms(preset.text).length, `пресет ${preset.id}`).toBeGreaterThan(0);
    }
  });

  it("ни один пресет не выходит за лимит вендора в одиночку", () => {
    for (const preset of OFFICIAL_PRESETS_FALLBACK) {
      expect(extractKeyterms(preset.text).length, `пресет ${preset.id}`).toBeLessThanOrEqual(100);
    }
  });

  it("объявление вырезается из текста, который уходит в модель", () => {
    for (const preset of OFFICIAL_PRESETS_FALLBACK) {
      expect(stripKeywordBlocks(preset.text), `пресет ${preset.id}`).not.toContain("[keywords]");
    }
  });

  it("термины не повторяются внутри одного пресета", () => {
    for (const preset of OFFICIAL_PRESETS_FALLBACK) {
      const terms = extractKeyterms(preset.text).map((t) => t.toLocaleLowerCase());
      expect(new Set(terms).size, `пресет ${preset.id}`).toBe(terms.length);
    }
  });
});
