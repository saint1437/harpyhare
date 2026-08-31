import { describe, expect, it } from "vitest";
import { addDoc, addFolder, EMPTY_LIBRARY } from "./context-library";
import type { PromptPreset } from "./presets";
import { BASE_SYSTEM_PROMPT, buildChatSystemPrompt } from "./system-prompt";

const presets: PromptPreset[] = [
  { id: "go", name: "Go", text: "Отвечай как senior Go-инженер." },
];

function contextLibrary() {
  const withFolder = addFolder(EMPTY_LIBRARY, "Собеседование", "f1");
  const withResume = addDoc(
    withFolder,
    { name: "Резюме", text: "Опыт: Go, PostgreSQL, Kafka", folderId: "f1" },
    "resume",
  );
  return addDoc(
    withResume,
    { name: "Не выбран", text: "ЭТО НЕ ДОЛЖНО ПОПАСТЬ", folderId: "f1" },
    "unused",
  );
}

describe("системный промпт", () => {
  it("всегда содержит короткие базовые правила", () => {
    const system = buildChatSystemPrompt([], "", EMPTY_LIBRARY, [], "");
    expect(system).toContain(BASE_SYSTEM_PROMPT);
    expect(system).toContain("--- БАЗОВЫЕ ПРАВИЛА ---");
  });

  it("сохраняет режим, выбранные документы и ручной контекст отдельными секциями", () => {
    const system = buildChatSystemPrompt(
      presets,
      "go",
      contextLibrary(),
      ["resume"],
      "Текущий проект: highload backend",
    );

    expect(system).toContain("--- РЕЖИМ РАБОТЫ ---\nОтвечай как senior Go-инженер.");
    expect(system).toContain("--- СПРАВОЧНЫЕ МАТЕРИАЛЫ ---");
    expect(system).toContain("Справочный материал «Резюме»:\nОпыт: Go, PostgreSQL, Kafka");
    expect(system).not.toContain("ЭТО НЕ ДОЛЖНО ПОПАСТЬ");
    expect(system).toContain("--- КОНТЕКСТ ПОЛЬЗОВАТЕЛЯ ---\nТекущий проект: highload backend");
  });

  it("не добавляет пустые секции режима и контекста", () => {
    const system = buildChatSystemPrompt([], "", EMPTY_LIBRARY, [], "   ");
    expect(system).not.toContain("--- РЕЖИМ РАБОТЫ ---");
    expect(system).not.toContain("--- СПРАВОЧНЫЕ МАТЕРИАЛЫ ---");
    expect(system).not.toContain("--- КОНТЕКСТ ПОЛЬЗОВАТЕЛЯ ---");
  });
});
