import { describe, expect, it } from "vitest";
import { ANSWER_STYLES } from "@/ipc/bindings";
import { ANSWER_STYLE_LABELS, answerStyleBlock } from "./answer-style";

const DETAILED = "detailed";
const CONCISE = "concise";
const TECH_PRESET = "golang";
const HR_PRESET = "hr-interview";
const DESIGN_PRESET = "system-design";
const USER_PRESET = "мой-собственный";

describe("answerStyleBlock", () => {
  it("подробный стиль ничего не дописывает — препромпт остаётся как есть", () => {
    expect(answerStyleBlock(DETAILED, TECH_PRESET)).toBe("");
  });

  it("незнакомый стиль тоже ничего не дописывает", () => {
    expect(answerStyleBlock("нет-такого-стиля", TECH_PRESET)).toBe("");
  });

  it("краткий стиль дописывает блок с явным приоритетом над объёмом выше", () => {
    const block = answerStyleBlock(CONCISE, TECH_PRESET);
    expect(block).toContain("отменяют любые указания об объёме выше");
    expect(block).toContain("КОРОТКИМ");
  });

  it("у собеседования с HR и у system design свои формулировки", () => {
    const tech = answerStyleBlock(CONCISE, TECH_PRESET);
    const hr = answerStyleBlock(CONCISE, HR_PRESET);
    const design = answerStyleBlock(CONCISE, DESIGN_PRESET);
    expect(hr).not.toBe(tech);
    expect(design).not.toBe(tech);
    expect(hr).toContain("3–5 предложений");
    expect(design).toContain("схеме");
  });

  it("пользовательский пресет получает общий краткий блок", () => {
    expect(answerStyleBlock(CONCISE, USER_PRESET)).toBe(answerStyleBlock(CONCISE, TECH_PRESET));
  });

  it("чат без препромпта тоже получает указание о краткости", () => {
    expect(answerStyleBlock(CONCISE, "")).not.toBe("");
  });

  it("у каждого стиля из контракта есть подпись для интерфейса", () => {
    for (const style of ANSWER_STYLES) {
      expect(ANSWER_STYLE_LABELS[style].trim()).not.toBe("");
    }
  });
});
