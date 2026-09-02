import { describe, expect, it } from "vitest";
import { BASE_SYSTEM_PROMPT, withBaseSystemPrompt } from "./system-prompt";

describe("withBaseSystemPrompt", () => {
  it("всегда добавляет базовые правила", () => {
    const prompt = withBaseSystemPrompt("");
    expect(prompt).toContain("--- БАЗОВЫЕ ПРАВИЛА ---");
    expect(prompt).toContain(BASE_SYSTEM_PROMPT);
    expect(prompt).not.toContain("--- РЕЖИМ РАБОТЫ ---");
  });

  it("режим идёт отдельной секцией после базы", () => {
    const prompt = withBaseSystemPrompt("Отвечай как senior Go-разработчик.");
    expect(prompt).toContain("--- РЕЖИМ РАБОТЫ ---\nОтвечай как senior Go-разработчик.");
    expect(prompt.indexOf("БАЗОВЫЕ ПРАВИЛА")).toBeLessThan(prompt.indexOf("РЕЖИМ РАБОТЫ"));
  });

  it("не трогает keyword-блок — его позже читает и вырезает v0.14 pipeline", () => {
    const prompt = withBaseSystemPrompt('[keywords]: ["Go", "Kafka"]\nРежим');
    expect(prompt).toContain("[keywords]");
  });
});
