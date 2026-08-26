import { getDict } from "@/i18n";
import { format } from "@/i18n/format";
import type { Dictionary } from "@/i18n/types";
import { list, obj, str } from "@/lib/schema";

export interface ContextFolder {
  id: string;
  name: string;
}

export interface ContextDoc {
  id: string;
  name: string;
  text: string;
  folderId: string;
}

export interface ContextLibrary {
  folders: ContextFolder[];
  docs: ContextDoc[];
}

export const EMPTY_LIBRARY: ContextLibrary = { folders: [], docs: [] };

export const DOC_TEXT_LIMIT_CHARS = 200_000;

/**
 * The text of ONE material was capped and the NUMBER of them was not, so the
 * ceiling on what a chat can drag into every request was 200 000 characters
 * times however many files the user had imported — and the whole library goes
 * through `count_tokens` on every projection. A cap the interface can name
 * ("больше N материалов не поместится") beats a library that quietly makes the
 * app slower with each import.
 */
export const DOC_LIMIT = 100;

/** `{limit}` is filled from `DOC_LIMIT`, so the number is never typed twice. */
export function docLimitNotice(dict: Dictionary): string {
  return format(dict.common.contextLibrary.limitNotice, { limit: String(DOC_LIMIT) });
}

export function libraryIsFull(lib: ContextLibrary): boolean {
  return lib.docs.length >= DOC_LIMIT;
}
const ROOT_FOLDER_ID = "";

/**
 * PROMPT CONTENT, not interface — and it stays Russian for that reason. It
 * heads a block inside the system prompt, next to the Russian preset text from
 * `config/presets.json` that addresses the model in the same language;
 * translating it with the UI would change what the model is told.
 */
const LIBRARY_CONTEXT_BLOCK_HEADER = "Справочный материал";

function uid(): string {
  return crypto.randomUUID();
}

function clampDocText(text: string): string {
  return text.length > DOC_TEXT_LIMIT_CHARS ? text.slice(0, DOC_TEXT_LIMIT_CHARS) : text;
}

export function addFolder(lib: ContextLibrary, name: string, id: string = uid()): ContextLibrary {
  const trimmed = name.trim() || getDict().common.contextLibrary.unnamedFolder;
  return { ...lib, folders: [...lib.folders, { id, name: trimmed }] };
}

export function renameFolder(lib: ContextLibrary, id: string, name: string): ContextLibrary {
  const trimmed = name.trim();
  if (trimmed === "") return lib;
  return {
    ...lib,
    folders: lib.folders.map((f) => (f.id === id ? { ...f, name: trimmed } : f)),
  };
}

export function removeFolder(lib: ContextLibrary, id: string): ContextLibrary {
  return {
    folders: lib.folders.filter((f) => f.id !== id),
    docs: lib.docs.map((d) => (d.folderId === id ? { ...d, folderId: ROOT_FOLDER_ID } : d)),
  };
}

export function addDoc(
  lib: ContextLibrary,
  doc: { name: string; text: string; folderId: string },
  id: string = uid(),
): ContextLibrary {
  if (libraryIsFull(lib)) return lib;
  const name = doc.name.trim() || getDict().common.contextLibrary.unnamedDoc;
  const folderId = lib.folders.some((f) => f.id === doc.folderId) ? doc.folderId : ROOT_FOLDER_ID;
  return {
    ...lib,
    docs: [...lib.docs, { id, name, text: clampDocText(doc.text), folderId }],
  };
}

export function updateDoc(
  lib: ContextLibrary,
  id: string,
  patch: Partial<Pick<ContextDoc, "name" | "text">>,
): ContextLibrary {
  return {
    ...lib,
    docs: lib.docs.map((d) => {
      if (d.id !== id) return d;
      return {
        ...d,
        name:
          patch.name !== undefined
            ? patch.name.trim() || getDict().common.contextLibrary.unnamedDoc
            : d.name,
        text: patch.text !== undefined ? clampDocText(patch.text) : d.text,
      };
    }),
  };
}

export function removeDoc(lib: ContextLibrary, id: string): ContextLibrary {
  return { ...lib, docs: lib.docs.filter((d) => d.id !== id) };
}

export function moveDoc(lib: ContextLibrary, id: string, folderId: string): ContextLibrary {
  const target = lib.folders.some((f) => f.id === folderId) ? folderId : ROOT_FOLDER_ID;
  return {
    ...lib,
    docs: lib.docs.map((d) => (d.id === id ? { ...d, folderId: target } : d)),
  };
}

export function docsInFolder(lib: ContextLibrary, folderId: string): ContextDoc[] {
  return lib.docs.filter((d) => d.folderId === folderId);
}

export function rootDocs(lib: ContextLibrary): ContextDoc[] {
  return docsInFolder(lib, ROOT_FOLDER_ID);
}

export function docNameFromFileName(fileName: string): string {
  const base = fileName.split("/").pop() ?? fileName;
  const withoutExt = base.replace(/\.(md|markdown|txt|pdf)$/i, "");
  return withoutExt.trim() || getDict().common.contextLibrary.unnamedDoc;
}

export function isPdfFileName(fileName: string): boolean {
  return /\.pdf$/i.test(fileName.trim());
}

export function libraryContextBlocks(lib: ContextLibrary, selectedIds: string[]): string[] {
  const byId = new Map(lib.docs.map((d) => [d.id, d]));
  return selectedIds
    .map((id) => byId.get(id))
    .filter((d): d is ContextDoc => d !== undefined && d.text.trim() !== "")
    .map((d) => `${LIBRARY_CONTEXT_BLOCK_HEADER} «${d.name}»:\n${d.text.trim()}`);
}

export function serializeLibrary(lib: ContextLibrary): string {
  return JSON.stringify(lib);
}

const storedFolderSchema = obj({
  id: str(),
  name: str(getDict().common.contextLibrary.unnamedFolder),
});

const storedDocSchema = obj({
  id: str(),
  name: str(getDict().common.contextLibrary.unnamedDoc),
  text: str(),
  folderId: str(ROOT_FOLDER_ID),
});

const storedLibrarySchema = obj({
  folders: list(storedFolderSchema, (folder) => folder.id !== ""),
  docs: list(storedDocSchema, (doc) => doc.id !== ""),
});

export function deserializeLibrary(json: string): ContextLibrary | null {
  if (json.trim() === "") return null;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  const stored = storedLibrarySchema.parse(raw);
  const folderIds = new Set(stored.folders.map((f) => f.id));
  return {
    folders: stored.folders,
    // The limit is applied on read as well: a file written before it existed
    // must not sneak a thousand materials past the ceiling.
    docs: stored.docs.slice(0, DOC_LIMIT).map((doc) => ({
      ...doc,
      text: clampDocText(doc.text),
      folderId: folderIds.has(doc.folderId) ? doc.folderId : ROOT_FOLDER_ID,
    })),
  };
}
