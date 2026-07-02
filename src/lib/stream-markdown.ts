/**
 * Делит стримящийся markdown на стабильный префикс (завершённые блоки) и активный хвост.
 *
 * Зачем: react-markdown перепарсивает весь текст при каждом флаше дельт — O(n²) за время
 * стрима. Префикс меняется только когда завершается очередной блок, поэтому его парс
 * можно мемоизировать, а перепарсивать каждый флаш — только короткий хвост.
 *
 * Резать можно только по границе абзаца ("\n\n") вне fenced-код-блока: незакрытый ```
 * в префиксе сломал бы рендер обеих половин.
 */
export function splitStableTail(text: string): [stable: string, tail: string] {
  let idx = text.lastIndexOf("\n\n");
  while (idx > 0) {
    if (!insideFence(text.slice(0, idx))) {
      return [text.slice(0, idx + 2), text.slice(idx + 2)];
    }
    idx = text.lastIndexOf("\n\n", idx - 1);
  }
  return ["", text];
}

/** Нечётное число fence-маркеров в префиксе → граница попала внутрь код-блока. */
function insideFence(prefix: string): boolean {
  const fences = prefix.match(/^\s{0,3}(?:```|~~~)/gm);
  return ((fences?.length ?? 0) & 1) === 1;
}
