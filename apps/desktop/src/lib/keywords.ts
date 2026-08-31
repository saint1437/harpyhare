/**
 * `[keywords]: [golang, gRPC, Kubernetes]` — terms the user declares inside a
 * preset, a library document or the chat context, to bias speech recognition
 * toward the vocabulary this conversation actually uses.
 *
 * Declared, never inferred. Guessing terms out of prose was the alternative and
 * it is a bad one: the vendor cap is small (xAI hard-errors above 100 terms,
 * it does not truncate), so a heuristic that spends the budget on common words
 * makes recognition worse rather than better. Writing the block **is** the
 * opt-in — there is no setting, and that is deliberate.
 */

/** `[keywords]` / `[КЛЮЧЕВЫЕ СЛОВА]`, optional colon, then a bracketed list. */
const KEYWORDS_BLOCK = /\[\s*keywords\s*\]\s*:?\s*\[([^\]]*)\]/gi;

const TERM_SEPARATORS = /[,;\n]/;
/** Long enough to be a term, short enough not to be a smuggled sentence. */
const TERM_MAX_CHARS = 60;

function cleanTerm(raw: string): string {
  return raw
    .trim()
    .replace(/^["'«]+|["'»]+$/g, "")
    .trim();
}

function isUsableTerm(term: string): boolean {
  return term.length > 0 && term.length <= TERM_MAX_CHARS;
}

/**
 * Terms declared in one piece of text, in the order written. Several blocks in
 * the same text are all read — a long document may group them by topic.
 */
export function extractKeyterms(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(KEYWORDS_BLOCK)) {
    const list = match[1] ?? "";
    for (const raw of list.split(TERM_SEPARATORS)) {
      const term = cleanTerm(raw);
      if (isUsableTerm(term)) found.push(term);
    }
  }
  return found;
}

/**
 * The same text with the declarations removed.
 *
 * They are configuration for the recogniser, not an instruction for the model,
 * so the answering model never sees them — otherwise every system prompt would
 * carry a stray directive it is expected to ignore.
 */
export function stripKeywordBlocks(text: string): string {
  return text
    .replace(KEYWORDS_BLOCK, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

/** Case-insensitive dedup, first spelling wins, order preserved. */
export function dedupeKeyterms(terms: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const term of terms) {
    const key = term.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(term);
  }
  return out;
}

/**
 * Every term a chat declares, across its preset, its library documents and its
 * own context. Capping is the vendor's business (`stt::registry`), not this
 * function's — it reports what the user asked for.
 */
export function chatKeyterms(sources: readonly string[]): string[] {
  return dedupeKeyterms(sources.flatMap(extractKeyterms));
}
