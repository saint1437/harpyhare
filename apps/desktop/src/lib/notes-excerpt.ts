import { foldForSearch } from "./notes-search";

export interface ExcerptPart {
  text: string;
  match: boolean;
}

interface MatchRange {
  start: number;
  end: number;
}

const EXCERPT_MAX_CHARS = 200;
const EXCERPT_LEAD_CHARS = 48;
const ELLIPSIS = "…";
const WHITESPACE_RUN = /\s+/gu;
const SPACE = " ";
const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;
const REGEX_ESCAPED_MATCH = "\\$&";
const YE_RUN = /е/g;
const YE_OR_YO_CLASS = "[её]";
const ALTERNATION = "|";
const MATCH_ALL_FLAGS = "giu";

function flattened(text: string): string {
  return text.replace(WHITESPACE_RUN, SPACE).trim();
}

function mergedRanges(ranges: MatchRange[]): MatchRange[] {
  const merged: MatchRange[] = [];
  for (const range of [...ranges].sort((a, b) => a.start - b.start)) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }
  return merged;
}

function termPattern(term: string): string {
  return term.replace(REGEX_SPECIALS, REGEX_ESCAPED_MATCH).replace(YE_RUN, YE_OR_YO_CLASS);
}

function termsRegex(terms: string[]): RegExp | null {
  const needles = [...new Set(terms.map(foldForSearch).filter((term) => term !== ""))].sort(
    (a, b) => b.length - a.length,
  );
  if (needles.length === 0) return null;
  return new RegExp(needles.map(termPattern).join(ALTERNATION), MATCH_ALL_FLAGS);
}

function matchRanges(flat: string, terms: string[]): MatchRange[] {
  const regex = termsRegex(terms);
  if (regex === null) return [];
  const found: MatchRange[] = [];
  for (const match of flat.matchAll(regex)) {
    found.push({ start: match.index, end: match.index + match[0].length });
  }
  return mergedRanges(found);
}

function windowStart(flat: string, firstMatch: number): number {
  const raw = Math.max(0, firstMatch - EXCERPT_LEAD_CHARS);
  if (raw === 0) return 0;
  const space = flat.indexOf(SPACE, raw);
  return space === -1 || space >= firstMatch ? raw : space + 1;
}

function withEllipsis(parts: ExcerptPart[], before: boolean, after: boolean): ExcerptPart[] {
  return [
    ...(before ? [{ text: ELLIPSIS, match: false }] : []),
    ...parts,
    ...(after ? [{ text: ELLIPSIS, match: false }] : []),
  ];
}

export function noteExcerpt(text: string, terms: string[]): ExcerptPart[] {
  const flat = flattened(text);
  if (flat === "") return [];
  const ranges = matchRanges(flat, terms);
  const first = ranges[0];
  const start = first ? windowStart(flat, first.start) : 0;
  const end = Math.min(flat.length, start + EXCERPT_MAX_CHARS);

  const parts: ExcerptPart[] = [];
  let cursor = start;
  for (const range of ranges) {
    if (range.end <= start) continue;
    if (range.start >= end) break;
    const from = Math.max(range.start, start);
    const to = Math.min(range.end, end);
    if (from > cursor) parts.push({ text: flat.slice(cursor, from), match: false });
    parts.push({ text: flat.slice(from, to), match: true });
    cursor = to;
  }
  if (cursor < end) parts.push({ text: flat.slice(cursor, end), match: false });
  return withEllipsis(parts, start > 0, end < flat.length);
}

export function noteMatchCount(text: string, terms: string[]): number {
  return matchRanges(flattened(text), terms).length;
}
