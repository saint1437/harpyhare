import type Markdown from "react-markdown";
import { type Components } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import { ExternalLinkAnchor } from "@/components/ExternalLinkAnchor";

const PLAIN_TEXT_LANGUAGES = ["html"];
const AUTODETECT_LANGUAGE_SUBSET = [
  "javascript",
  "typescript",
  "python",
  "json",
  "bash",
  "css",
  "xml",
  "sql",
  "yaml",
  "rust",
  "go",
  "java",
];

export const PROSE_MARKDOWN_CLASS = "prose-answer text-chat leading-relaxed text-foreground/90";

export const REHYPE_PLUGINS: NonNullable<Parameters<typeof Markdown>[0]["rehypePlugins"]> = [
  [
    rehypeHighlight,
    { detect: true, plainText: PLAIN_TEXT_LANGUAGES, subset: AUTODETECT_LANGUAGE_SUBSET },
  ],
];

export const markdownComponents: Components = { a: ExternalLinkAnchor };
