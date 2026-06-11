/**
 * Закрытые fenced-блоки ```html из markdown-текста (язык регистронезависимо).
 * Незакрытый fence (стрим ещё идёт) и пустые блоки не извлекаются —
 * автооткрытие превью работает только по финальному непустому HTML.
 */
export function extractHtmlBlocks(markdown: string): string[] {
  const re = /^```html[ \t]*\r?\n([\s\S]*?)^```[ \t]*$/gim;
  const blocks: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    const code = (m[1] ?? "").replace(/\r?\n$/, "");
    if (code.trim() !== "") blocks.push(code);
  }
  return blocks;
}
