import { isValidElement, memo, type ReactNode } from "react";
import Markdown, { type Components } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { openExternal } from "@/ipc/commands";
import { splitStableTail } from "@/lib/stream-markdown";
import { ASSISTANT_PROSE_CLASS } from "./answer-prose";
import { HtmlBlockChip } from "./HtmlBlockChip";

/**
 * The whole markdown pipeline — react-markdown, micromark, remark-gfm and
 * highlight.js — in ONE module, behind ONE `lazy` boundary in `AnswerPanel`.
 *
 * Together they are the larger half of the HUD's JavaScript, and none of it is
 * needed until an assistant has actually said something: the window opens on an
 * empty chat, and highlight.js alone is not wanted until the first answer that
 * contains code. Splitting it here is what turns that into a chunk the HUD
 * fetches when the first answer arrives rather than at start.
 *
 * The invariant that survives the move: `html` stays in `plainText`, because the
 * preview chip (`makePre` → `HtmlBlockChip`) needs the code element's children
 * to remain a RAW STRING — highlighting would turn them into an array of spans
 * and silently break the chip.
 */

const EXTERNAL_HTTP_URL = /^https?:\/\//;
const HTML_LANGUAGE_CLASS = "language-html";
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

const REMARK_PLUGINS: NonNullable<Parameters<typeof Markdown>[0]["remarkPlugins"]> = [remarkGfm];

const REHYPE_PLUGINS: NonNullable<Parameters<typeof Markdown>[0]["rehypePlugins"]> = [
  [
    rehypeHighlight,
    { detect: true, plainText: PLAIN_TEXT_LANGUAGES, subset: AUTODETECT_LANGUAGE_SUBSET },
  ],
];

function ExternalLinkAnchor({ href, children }: { href?: string; children?: ReactNode }) {
  return (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        if (href && EXTERNAL_HTTP_URL.test(href)) void openExternal(href);
      }}
      className="text-fg underline decoration-fg/40 underline-offset-2 hover:decoration-fg"
    >
      {children}
    </a>
  );
}

const markdownComponents = { a: ExternalLinkAnchor };

function hasHtmlLanguageToken(className: string) {
  return className.split(/\s+/).some((token) => token.toLowerCase() === HTML_LANGUAGE_CLASS);
}

function makePre(onTogglePreview: (code: string) => void) {
  return function PreBlock({ children }: { children?: ReactNode }) {
    const code = isValidElement<{ className?: string; children?: ReactNode }>(children)
      ? children
      : null;
    const text = code?.props.children;
    if (code && hasHtmlLanguageToken(code.props.className ?? "") && typeof text === "string") {
      return (
        <HtmlBlockChip
          code={text}
          onToggle={() => {
            onTogglePreview(text);
          }}
        />
      );
    }
    return <pre>{children}</pre>;
  };
}

const MarkdownChunk = memo(function MarkdownChunk({
  text,
  components,
}: {
  text: string;
  components: Components;
}) {
  return (
    <Markdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS} components={components}>
      {text}
    </Markdown>
  );
});

function Assistant({ text, components }: { text: string; components: Components }) {
  return (
    <div className={ASSISTANT_PROSE_CLASS}>
      <MarkdownChunk text={text} components={components} />
    </div>
  );
}

function StreamingAssistant({ text, components }: { text: string; components: Components }) {
  const [stable, tail] = splitStableTail(text);
  return (
    <div className={ASSISTANT_PROSE_CLASS}>
      {stable !== "" && <MarkdownChunk text={stable} components={components} />}
      {tail !== "" && <MarkdownChunk text={tail} components={components} />}
    </div>
  );
}

export interface AnswerMarkdownProps {
  text: string;
  /**
   * A live stream is split into a stable prefix and a tail so the parse of the
   * settled part is memoised across frames (`splitStableTail`).
   */
  streaming: boolean;
  onTogglePreview: (code: string) => void;
}

export default function AnswerMarkdown({ text, streaming, onTogglePreview }: AnswerMarkdownProps) {
  const components: Components = { ...markdownComponents, pre: makePre(onTogglePreview) };
  return streaming ? (
    <StreamingAssistant text={text} components={components} />
  ) : (
    <Assistant text={text} components={components} />
  );
}
