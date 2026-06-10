import DOMPurify from "dompurify";
import { marked } from "marked";

/** Markdown ответа Claude → безопасный HTML. async:false — нам нужен синхронный рендер на каждый стрим-дельту. */
export function renderMarkdown(md: string): string {
  return DOMPurify.sanitize(marked.parse(md, { async: false }) as string);
}
