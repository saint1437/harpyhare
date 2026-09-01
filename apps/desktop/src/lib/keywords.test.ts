import { describe, expect, it } from "vitest";
import { chatKeyterms, dedupeKeyterms, extractKeyterms, stripKeywordBlocks } from "./keywords";

describe("extractKeyterms", () => {
  it("читает объявленный список", () => {
    expect(extractKeyterms("[keywords]: [golang, gRPC, Kubernetes]")).toEqual([
      "golang",
      "gRPC",
      "Kubernetes",
    ]);
  });

  it("не требует двоеточия и терпит пробелы внутри скобок", () => {
    expect(extractKeyterms("[ keywords ] [ Go ,  Redis ]")).toEqual(["Go", "Redis"]);
  });

  it("регистр самого маркера не важен, а регистр терминов сохраняется", () => {
    expect(extractKeyterms("[KEYWORDS]: [PostgreSQL]")).toEqual(["PostgreSQL"]);
  });

  it("разделителем может быть запятая, точка с запятой или перенос строки", () => {
    expect(extractKeyterms("[keywords]: [Go; Rust\nZig]")).toEqual(["Go", "Rust", "Zig"]);
  });

  it("снимает кавычки вокруг термина", () => {
    expect(extractKeyterms('[keywords]: ["Go", «Го»]')).toEqual(["Go", "Го"]);
  });

  it("читает несколько блоков в одном тексте", () => {
    const text = "Про язык\n[keywords]: [Go]\nПро базы\n[keywords]: [Postgres]";
    expect(extractKeyterms(text)).toEqual(["Go", "Postgres"]);
  });

  it("пустой список и отсутствие блока дают пустой результат", () => {
    expect(extractKeyterms("[keywords]: []")).toEqual([]);
    expect(extractKeyterms("обычный текст без объявлений")).toEqual([]);
  });

  it("не тащит внутрь предложение, случайно попавшее в список", () => {
    const sentence = "а".repeat(200);
    expect(extractKeyterms(`[keywords]: [Go, ${sentence}]`)).toEqual(["Go"]);
  });
});

describe("stripKeywordBlocks", () => {
  it("убирает объявление из промпта, остальное не трогает", () => {
    const text = "Ты — senior Go-инженер.\n[keywords]: [golang, gRPC]\nОтвечай кратко.";
    const stripped = stripKeywordBlocks(text);
    expect(stripped).toContain("Ты — senior Go-инженер.");
    expect(stripped).toContain("Отвечай кратко.");
    expect(stripped).not.toContain("keywords");
    expect(stripped).not.toContain("gRPC");
  });

  it("текст без объявлений остаётся собой", () => {
    expect(stripKeywordBlocks("просто инструкция")).toBe("просто инструкция");
  });

  it("не оставляет висящих пробелов на месте блока", () => {
    expect(stripKeywordBlocks("строка   [keywords]: [Go]   \nвторая")).toBe("строка\nвторая");
  });
});

describe("dedupeKeyterms", () => {
  it("схлопывает повторы без учёта регистра, оставляя первое написание", () => {
    expect(dedupeKeyterms(["Go", "go", "GO", "Rust"])).toEqual(["Go", "Rust"]);
  });
});

describe("chatKeyterms", () => {
  it("собирает термины из всех источников чата и дедуплицирует", () => {
    const preset = "[keywords]: [golang, gRPC]";
    const doc = "Резюме\n[keywords]: [Kubernetes, Golang]";
    const context = "[keywords]: [Redis]";
    expect(chatKeyterms([preset, doc, context])).toEqual(["golang", "gRPC", "Kubernetes", "Redis"]);
  });

  it("источники без объявлений ничего не добавляют", () => {
    expect(chatKeyterms(["обычный препромпт", ""])).toEqual([]);
  });
});

describe("мусорный ввод", () => {
  it("вложенные скобки не рвут список и не оставляют хвост в промпте", () => {
    const text = "[keywords]: [Go, slice, []byte]";
    expect(extractKeyterms(text)).toEqual(["Go", "slice", "[]byte"]);
    expect(stripKeywordBlocks(text)).toBe("");
  });

  it("незакрытая скобка стоит терминов, но не съедает остальной промпт", () => {
    const text = "Правила.\n[keywords]: [golang, gRPC\nОтвечай кратко.";
    expect(extractKeyterms(text)).toEqual(["golang", "gRPC"]);
    expect(stripKeywordBlocks(text)).toBe("Правила.\n\nОтвечай кратко.");
  });

  it("русский маркер работает так же, как английский", () => {
    expect(extractKeyterms("[ключевые слова]: [Go, Rust]")).toEqual(["Go", "Rust"]);
  });

  it("пустой список не даёт терминов и всё равно вырезается", () => {
    expect(extractKeyterms("текст [keywords]: [] хвост")).toEqual([]);
    expect(stripKeywordBlocks("текст [keywords]: [] хвост")).toBe("текст  хвост");
  });
});
