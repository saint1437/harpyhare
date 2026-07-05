const CLOSED_HTML_FENCE_RE = /^```html[ \t]*\r?\n([\s\S]*?)^```[ \t]*$/gim;
const TRAILING_NEWLINE_RE = /\r?\n$/;

export function extractHtmlBlocks(markdown: string): string[] {
  const blocks: string[] = [];
  for (const match of markdown.matchAll(CLOSED_HTML_FENCE_RE)) {
    const code = (match[1] ?? "").replace(TRAILING_NEWLINE_RE, "");
    if (code.trim() !== "") blocks.push(code);
  }
  return blocks;
}
