import MiniSearch, { type SearchResult } from "minisearch";
import type { ContextDoc } from "./context-library";

const ID_FIELD = "id" satisfies keyof ContextDoc;
const NAME_FIELD = "name" satisfies keyof ContextDoc;
const INDEXED_FIELDS = [NAME_FIELD, "text"] satisfies (keyof ContextDoc)[];

const NAME_BOOST = 4;
const FUZZY_TOLERANCE = 0.2;
const MAX_NOTE_HITS = 50;

const YO = "ё";
const YE = "е";

export interface NoteHit {
  docId: string;
  terms: string[];
}

export interface NoteRow {
  doc: ContextDoc;
  terms: string[];
}

export type NotesIndex = MiniSearch<ContextDoc>;

function foldChar(char: string): string {
  const lower = char.toLowerCase();
  const folded = lower === YO ? YE : lower;
  return folded.length === char.length ? folded : char;
}

export function foldForSearch(text: string): string {
  return Array.from(text, foldChar).join("");
}

export function buildNotesIndex(docs: ContextDoc[]): NotesIndex {
  const index = new MiniSearch<ContextDoc>({
    idField: ID_FIELD,
    fields: INDEXED_FIELDS,
    processTerm: foldForSearch,
  });
  index.addAll(docs);
  return index;
}

function hitDocId(result: SearchResult): string {
  return typeof result.id === "string" ? result.id : "";
}

export function searchNotes(index: NotesIndex, query: string): NoteHit[] {
  const trimmed = query.trim();
  if (trimmed === "") return [];
  return index
    .search(trimmed, {
      prefix: true,
      fuzzy: FUZZY_TOLERANCE,
      boost: { [NAME_FIELD]: NAME_BOOST },
      combineWith: "AND",
    })
    .slice(0, MAX_NOTE_HITS)
    .map((result) => ({ docId: hitDocId(result), terms: result.terms }))
    .filter((hit) => hit.docId !== "");
}

export function noteRows(index: NotesIndex | null, docs: ContextDoc[], query: string): NoteRow[] {
  if (query.trim() === "") return docs.map((doc) => ({ doc, terms: [] }));
  if (index === null) return [];
  const byId = new Map(docs.map((doc) => [doc.id, doc]));
  return searchNotes(index, query).flatMap((hit) => {
    const doc = byId.get(hit.docId);
    return doc ? [{ doc, terms: hit.terms }] : [];
  });
}
