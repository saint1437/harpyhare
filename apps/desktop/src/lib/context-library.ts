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
const ROOT_FOLDER_ID = "";
const UNNAMED_DOC = "Без имени";
const UNNAMED_FOLDER = "Папка";
const LIBRARY_CONTEXT_BLOCK_HEADER = "Справочный материал";

function uid(): string {
  return crypto.randomUUID();
}

function clampDocText(text: string): string {
  return text.length > DOC_TEXT_LIMIT_CHARS ? text.slice(0, DOC_TEXT_LIMIT_CHARS) : text;
}

export function addFolder(lib: ContextLibrary, name: string, id: string = uid()): ContextLibrary {
  const trimmed = name.trim() || UNNAMED_FOLDER;
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
  const name = doc.name.trim() || UNNAMED_DOC;
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
        name: patch.name !== undefined ? patch.name.trim() || UNNAMED_DOC : d.name,
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
  const withoutExt = base.replace(/\.(md|markdown|txt)$/i, "");
  return withoutExt.trim() || UNNAMED_DOC;
}

export function libraryContextBlocks(lib: ContextLibrary, selectedIds: string[]): string[] {
  const byId = new Map(lib.docs.map((d) => [d.id, d]));
  return selectedIds
    .map((id) => byId.get(id))
    .filter((d): d is ContextDoc => d !== undefined && d.text.trim() !== "")
    .map((d) => `${LIBRARY_CONTEXT_BLOCK_HEADER} «${d.name}»:\n${d.text.trim()}`);
}

export function sanitizeSelectedIds(lib: ContextLibrary, selectedIds: string[]): string[] {
  const known = new Set(lib.docs.map((d) => d.id));
  return selectedIds.filter((id) => known.has(id));
}

export function serializeLibrary(lib: ContextLibrary): string {
  return JSON.stringify(lib);
}

export function deserializeLibrary(json: string): ContextLibrary | null {
  if (json.trim() === "") return null;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  const o = raw as Partial<ContextLibrary>;
  const folders = (Array.isArray(o.folders) ? o.folders : []).flatMap((rawFolder) => {
    const f = rawFolder as Partial<ContextFolder>;
    return typeof f.id === "string" && typeof f.name === "string"
      ? [{ id: f.id, name: f.name }]
      : [];
  });
  const folderIds = new Set(folders.map((f) => f.id));
  const docs = (Array.isArray(o.docs) ? o.docs : []).flatMap((rawDoc) => {
    const d = rawDoc as Partial<ContextDoc>;
    if (typeof d.id !== "string" || typeof d.name !== "string") return [];
    return [
      {
        id: d.id,
        name: d.name,
        text: clampDocText(typeof d.text === "string" ? d.text : ""),
        folderId:
          typeof d.folderId === "string" && folderIds.has(d.folderId) ? d.folderId : ROOT_FOLDER_ID,
      },
    ];
  });
  return { folders, docs };
}
