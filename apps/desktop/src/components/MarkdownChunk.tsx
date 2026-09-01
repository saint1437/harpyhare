import { memo } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { REHYPE_PLUGINS } from "@/components/markdown-config";

export const MarkdownChunk = memo(function MarkdownChunk({
  text,
  components,
}: {
  text: string;
  components: Components;
}) {
  return (
    <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={REHYPE_PLUGINS} components={components}>
      {text}
    </Markdown>
  );
});
