import { describe, expect, it } from "vitest";
import { mergePresets, presetText, type PromptPreset } from "./presets";

const presets: PromptPreset[] = [
  { id: "a", name: "A", text: "текст-A" },
  { id: "b", name: "B", text: "текст-B" },
];

const preset = (id: string, name = id): PromptPreset => ({ id, name, text: id });

describe("presetText", () => {
  it("возвращает текст пресета по id", () => {
    expect(presetText(presets, "b")).toBe("текст-B");
  });
  it("неизвестный id → пустая строка", () => {
    expect(presetText(presets, "zzz")).toBe("");
  });
  it("пустой presetId → пустая строка", () => {
    expect(presetText(presets, "")).toBe("");
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
