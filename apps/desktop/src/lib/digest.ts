// A short, stable digest for values that must not travel inside a react-query
// key by their full text.
//
// `useBaseQuery` re-runs `defaultQueryOptions` — and therefore `JSON.stringify`
// over the whole key — on EVERY render, before `enabled` is even consulted. The
// context-library system prompt can reach megabytes (200 000 characters per
// document, with no cap on the document count), so putting it in the key meant
// stringifying it sixty times a second during a stream.
//
// FNV-1a is not a cryptographic hash and 32 bits collide; the length is carried
// alongside it so that two prompts must match in both to be treated as the same
// query. Collisions here would show a stale token count, never wrong data.
const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export function digest(text: string): string {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  // >>> 0 keeps it an unsigned 32-bit value; Math.imul yields a signed one.
  return `${String(text.length)}.${(hash >>> 0).toString(36)}`;
}
