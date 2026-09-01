const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const SECOND_LANE_BASIS = 0x9e3779b9;
const SECOND_LANE_PRIME = 0x85ebca6b;
const DIGEST_RADIX = 36;
const DIGEST_SEPARATOR = ":";

/**
 * Короткий отпечаток текста для ключа кеша: сам системный промпт кладут в ключ
 * react-query, а тот сериализует ключ на каждом рендере — четыреста килобайт
 * в `JSON.stringify` шестьдесят раз в секунду во время стрима.
 *
 * Двух дорожек достаточно, чтобы совпадение длины и одного хеша не выдавало
 * устаревший счётчик токенов: одна 32-битная дорожка даёт коллизию примерно
 * на 77 тысячах вариантов промпта, две — на пяти миллиардах.
 */
export function textDigest(text: string): string {
  let fnv = FNV_OFFSET_BASIS;
  let mixed = SECOND_LANE_BASIS;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    fnv = Math.imul(fnv ^ code, FNV_PRIME);
    mixed = Math.imul(mixed + code, SECOND_LANE_PRIME) ^ (mixed >>> 15);
  }
  return [
    String(text.length),
    (fnv >>> 0).toString(DIGEST_RADIX),
    (mixed >>> 0).toString(DIGEST_RADIX),
  ].join(DIGEST_SEPARATOR);
}
