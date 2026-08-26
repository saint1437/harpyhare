import { describe, expect, it } from "vitest";
import {
  addDoc,
  addFolder,
  deserializeLibrary,
  DOC_LIMIT,
  EMPTY_LIBRARY,
  libraryIsFull,
  docNameFromFileName,
  isPdfFileName,
  libraryContextBlocks,
  moveDoc,
  removeDoc,
  removeFolder,
  renameFolder,
  rootDocs,
  serializeLibrary,
  updateDoc,
  DOC_TEXT_LIMIT_CHARS,
} from "./context-library";

function libWithFolderAndDoc() {
  const withFolder = addFolder(EMPTY_LIBRARY, "Собесы", "f1");
  return addDoc(withFolder, { name: "Резюме", text: "текст резюме", folderId: "f1" }, "d1");
}

describe("библиотека контекстов", () => {
  it("addFolder/addDoc кладут материал в папку", () => {
    const lib = libWithFolderAndDoc();
    expect(lib.folders).toHaveLength(1);
    expect(lib.docs[0]).toMatchObject({ id: "d1", folderId: "f1", name: "Резюме" });
  });

  it("addDoc с несуществующей папкой падает в корень; имя по умолчанию", () => {
    const lib = addDoc(EMPTY_LIBRARY, { name: "  ", text: "т", folderId: "nope" }, "d1");
    expect(lib.docs[0]).toMatchObject({ folderId: "", name: "Без имени" });
  });

  it("removeFolder переносит материалы в корень", () => {
    const lib = removeFolder(libWithFolderAndDoc(), "f1");
    expect(lib.folders).toHaveLength(0);
    expect(lib.docs[0]?.folderId).toBe("");
    expect(rootDocs(lib)).toHaveLength(1);
  });

  it("renameFolder игнорирует пустое имя", () => {
    const lib = renameFolder(libWithFolderAndDoc(), "f1", "   ");
    expect(lib.folders[0]?.name).toBe("Собесы");
  });

  it("updateDoc правит имя и текст, клампит длину", () => {
    const lib = updateDoc(libWithFolderAndDoc(), "d1", {
      name: "Новое",
      text: "x".repeat(DOC_TEXT_LIMIT_CHARS + 5),
    });
    expect(lib.docs[0]?.name).toBe("Новое");
    expect(lib.docs[0]?.text).toHaveLength(DOC_TEXT_LIMIT_CHARS);
  });

  it("moveDoc в несуществующую папку — в корень; removeDoc удаляет", () => {
    const moved = moveDoc(libWithFolderAndDoc(), "d1", "ghost");
    expect(moved.docs[0]?.folderId).toBe("");
    expect(removeDoc(moved, "d1").docs).toHaveLength(0);
  });

  it("docNameFromFileName снимает расширение и путь", () => {
    expect(docNameFromFileName("/tmp/interview.md")).toBe("interview");
    expect(docNameFromFileName("Заметки.TXT")).toBe("Заметки");
    expect(docNameFromFileName("/Users/me/Отчёт.PDF")).toBe("Отчёт");
    expect(docNameFromFileName(".md")).toBe("Без имени");
  });

  it("isPdfFileName распознаёт только pdf по расширению", () => {
    expect(isPdfFileName("Отчёт.pdf")).toBe(true);
    expect(isPdfFileName("/tmp/scan.PDF")).toBe(true);
    expect(isPdfFileName("notes.txt")).toBe(false);
    expect(isPdfFileName("pdf")).toBe(false);
  });

  it("libraryContextBlocks форматирует выбранные, пропуская пустые и незнакомые id", () => {
    const lib = addDoc(libWithFolderAndDoc(), { name: "Пустой", text: "  ", folderId: "" }, "d2");
    const blocks = libraryContextBlocks(lib, ["d1", "d2", "ghost"]);
    expect(blocks).toEqual(["Справочный материал «Резюме»:\nтекст резюме"]);
  });

  it("serialize/deserialize — раунд-трип; битый folderId чинится в корень", () => {
    const lib = libWithFolderAndDoc();
    expect(deserializeLibrary(serializeLibrary(lib))).toEqual(lib);
    const broken = JSON.stringify({
      folders: [],
      docs: [{ id: "d", name: "n", text: "t", folderId: "ghost" }],
    });
    expect(deserializeLibrary(broken)?.docs[0]?.folderId).toBe("");
    expect(deserializeLibrary("не json")).toBeNull();
    expect(deserializeLibrary("")).toBeNull();
  });

  it("не пускает больше DOC_LIMIT материалов", () => {
    let lib = EMPTY_LIBRARY;
    for (let i = 0; i < DOC_LIMIT; i++) {
      lib = addDoc(lib, { name: `м${String(i)}`, text: "t", folderId: "" }, `d${String(i)}`);
    }
    expect(lib.docs).toHaveLength(DOC_LIMIT);
    expect(libraryIsFull(lib)).toBe(true);
    const refused = addDoc(lib, { name: "лишний", text: "t", folderId: "" }, "extra");
    expect(refused).toBe(lib);
  });

  // A file written before the limit existed must not smuggle a thousand
  // materials past it — every one of them goes through count_tokens.
  it("обрезает по DOC_LIMIT при чтении", () => {
    const docs = Array.from({ length: DOC_LIMIT + 5 }, (_, i) => ({
      id: `d${String(i)}`,
      name: `м${String(i)}`,
      text: "t",
      folderId: "",
    }));
    const restored = deserializeLibrary(JSON.stringify({ folders: [], docs }));
    expect(restored?.docs).toHaveLength(DOC_LIMIT);
  });

  it("режет только битое поле, а не материал целиком", () => {
    const restored = deserializeLibrary(
      JSON.stringify({ folders: [], docs: [{ id: "d", name: 7, text: null, folderId: 3 }] }),
    );
    expect(restored?.docs[0]).toEqual({ id: "d", name: "Без имени", text: "", folderId: "" });
  });
});
