import { describe, expect, it } from "vitest";
import type { ContextDoc } from "./context-library";
import { buildNotesIndex, foldForSearch, searchNotes } from "./notes-search";

function doc(id: string, name: string, text: string): ContextDoc {
  return { id, name, text, folderId: "" };
}

const DOCS: ContextDoc[] = [
  doc("react", "React 19", "Хуки, конкурентный рендер и Server Components."),
  doc("rust", "Rust и Tauri", "Владение, заимствование, каналы. Tauri 2 и его IPC."),
  doc("interview", "Вопросы с интервью", "Расскажите про конкурентный рендер в React."),
];

function ids(query: string): string[] {
  return searchNotes(buildNotesIndex(DOCS), query).map((hit) => hit.docId);
}

describe("foldForSearch", () => {
  it("свёртка не сдвигает индексы", () => {
    for (const sample of ["Ёлка", "İstanbul", "Straße", "ПРИВЕТ 🙂", ""]) {
      expect(foldForSearch(sample)).toHaveLength(sample.length);
    }
  });

  it("ё и е — одна буква", () => {
    expect(foldForSearch("Ёлка")).toBe(foldForSearch("елка"));
  });
});

describe("searchNotes", () => {
  it("пустой запрос ничего не ищет", () => {
    expect(ids("   ")).toEqual([]);
  });

  it("находит по тексту заметки, а не только по названию", () => {
    expect(ids("заимствование")).toEqual(["rust"]);
  });

  it("совпадение в названии весит больше совпадения в тексте", () => {
    expect(ids("react")[0]).toBe("react");
  });

  it("ищет по началу слова — искать целиком не нужно", () => {
    expect(ids("конкурент")).toEqual(expect.arrayContaining(["react", "interview"]));
  });

  it("прощает опечатку", () => {
    expect(ids("владенее")).toEqual(["rust"]);
  });

  it("несколько слов сужают выдачу, а не расширяют", () => {
    expect(ids("рендер")).toHaveLength(2);
    expect(ids("рендер интервью")).toEqual(["interview"]);
  });

  it("отдаёт совпавшие слова документа — по ним подсвечивается цитата", () => {
    const [hit] = searchNotes(buildNotesIndex(DOCS), "конкурент");
    expect(hit?.terms).toContain("конкурентный");
  });

  it("на пустой библиотеке не падает", () => {
    expect(searchNotes(buildNotesIndex([]), "что угодно")).toEqual([]);
  });
});
