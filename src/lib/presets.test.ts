import { describe, expect, it } from "vitest";
import { presetText, type PromptPreset } from "./presets";

const presets: PromptPreset[] = [
  { id: "a", name: "A", text: "текст-A" },
  { id: "b", name: "B", text: "текст-B" },
];

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
