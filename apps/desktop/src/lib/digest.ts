const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const DIGEST_RADIX = 36;
const DIGEST_SEPARATOR = ":";

export function textDigest(text: string): string {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return [String(text.length), (hash >>> 0).toString(DIGEST_RADIX)].join(DIGEST_SEPARATOR);
}
