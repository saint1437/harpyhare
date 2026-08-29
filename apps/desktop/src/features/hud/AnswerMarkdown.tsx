import type { Element, ElementContent, Root } from "hast";
import { toText } from "hast-util-to-text";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import { createLowlight } from "lowlight";
import {
  createContext,
  isValidElement,
  memo,
  useContext,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { visit } from "unist-util-visit";
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
 * preview chip (`PreBlock` → `HtmlBlockChip`) needs the code element's children
 * to remain a RAW STRING — highlighting would turn them into an array of spans
 * and silently break the chip.
 */

const EXTERNAL_HTTP_URL = /^https?:\/\//;
const HTML_LANGUAGE_CLASS = "language-html";
const PLAIN_TEXT_LANGUAGES = ["html"];

const REMARK_PLUGINS: NonNullable<Parameters<typeof Markdown>[0]["remarkPlugins"]> = [remarkGfm];

/**
 * The grammars this app highlights, registered by hand rather than through
 * `rehype-highlight`.
 *
 * That plugin cannot be given a smaller registry: its v7 source does
 * `import {common} from 'lowlight'` at module scope as the default of its
 * `languages` option, so all ~37 `common` grammars stay in the chunk however it
 * is configured — 195 KB of the HUD's `vendor-highlight` were grammars nothing
 * could reach. The transform below is the same twenty lines of that plugin over
 * a registry we own.
 *
 * This list IS the autodetection set as well (`highlightAuto` scores every
 * REGISTERED language), which is what the plugin's `subset` option used to say
 * separately — the two can no longer drift. Adding a language is one import and
 * one entry here; the price of the smaller registry is that a fenced block
 * tagged with a language that is NOT listed renders as a plain code block
 * instead of being highlighted from `common`.
 */
const HIGHLIGHT_GRAMMARS = {
  bash,
  css,
  go,
  java,
  javascript,
  json,
  python,
  rust,
  sql,
  typescript,
  xml,
  yaml,
};

const lowlight = createLowlight(HIGHLIGHT_GRAMMARS);

const HLJS_CLASS = "hljs";
const NO_HIGHLIGHT_CLASSES = ["no-highlight", "nohighlight"];
const LANGUAGE_CLASS_PREFIXES = ["language-", "lang-"];
const UNKNOWN_LANGUAGE_MESSAGE = "Unknown language";

/**
 * The language of a `<code>`, or `false` for an explicit opt-out class.
 * `undefined` means "not stated" — which is what turns on autodetection.
 */
function languageOf(node: Element): string | false | undefined {
  const list = node.properties["className"];
  if (!Array.isArray(list)) return undefined;
  let name: string | undefined;
  for (const item of list) {
    const value = String(item);
    if (NO_HIGHLIGHT_CLASSES.includes(value)) return false;
    if (name !== undefined) continue;
    const prefix = LANGUAGE_CLASS_PREFIXES.find((candidate) => value.startsWith(candidate));
    if (prefix !== undefined) name = value.slice(prefix.length);
  }
  return name;
}

/**
 * react-markdown builds a fresh unified processor on every render, so an
 * attacher that did any work would run it on the per-frame path of a stream.
 * Both the registry above and this transform close over nothing that changes,
 * so they are built once at module scope and a trivial attacher hands the
 * transform back.
 */
function highlightCodeBlocks(tree: Root): undefined {
  visit(tree, "element", (node, _index, parent) => {
    if (node.tagName !== "code" || parent?.type !== "element" || parent.tagName !== "pre") return;

    const language = languageOf(node);
    if (language === false) return;
    // The preview chip needs a ```html block to keep a RAW STRING child, so it
    // is never highlighted — see the module header.
    if (language !== undefined && PLAIN_TEXT_LANGUAGES.includes(language)) return;

    const existing = node.properties["className"];
    const classes: (string | number)[] = Array.isArray(existing) ? existing : [];
    if (!classes.includes(HLJS_CLASS)) classes.unshift(HLJS_CLASS);
    node.properties["className"] = classes;

    const text = toText(node, { whitespace: "pre" });
    let result;
    try {
      result =
        language === undefined || language === ""
          ? lowlight.highlightAuto(text)
          : lowlight.highlight(language, text);
    } catch (error) {
      // A block tagged with a grammar we do not register keeps the `hljs` class
      // and loses only its tokens; anything else is a real bug and must surface.
      if (error instanceof Error && error.message.includes(UNKNOWN_LANGUAGE_MESSAGE)) return;
      throw error;
    }

    const detected = result.data?.language;
    if ((language === undefined || language === "") && detected !== undefined) {
      classes.push(`language-${detected}`);
    }
    if (result.children.length > 0) {
      node.children = result.children as ElementContent[];
    }
  });
}

const REHYPE_PLUGINS: NonNullable<Parameters<typeof Markdown>[0]["rehypePlugins"]> = [
  () => highlightCodeBlocks,
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

function hasHtmlLanguageToken(className: string) {
  return className.split(/\s+/).some((token) => token.toLowerCase() === HTML_LANGUAGE_CLASS);
}

type TogglePreview = (code: string) => void;

const NO_PREVIEW: TogglePreview = () => undefined;

/**
 * The chip's toggle reaches `PreBlock` through a ref whose IDENTITY never
 * changes, and that is the whole trick.
 *
 * `components` used to be assembled in the render body — `{...markdownComponents,
 * pre: makePre(onTogglePreview)}` — which made both the object AND the `pre`
 * COMPONENT TYPE new on every pass: `memo(MarkdownChunk)` could not hit, so the
 * settled prefix `splitStableTail` exists to protect was re-parsed and every
 * code block re-highlighted and remounted, sixty times a second. Handing the
 * callback down through a context VALUE would have re-woken the same subtrees
 * from the other side, since a context change bypasses `memo`; a ref does not
 * change, and the handler is only ever read at click time.
 */
const TogglePreviewContext = createContext<RefObject<TogglePreview>>({ current: NO_PREVIEW });

function PreBlock({ children }: { children?: ReactNode }) {
  const onTogglePreview = useContext(TogglePreviewContext);
  const code = isValidElement<{ className?: string; children?: ReactNode }>(children)
    ? children
    : null;
  const text = code?.props.children;
  if (code && hasHtmlLanguageToken(code.props.className ?? "") && typeof text === "string") {
    return (
      <HtmlBlockChip
        code={text}
        onToggle={() => {
          onTogglePreview.current(text);
        }}
      />
    );
  }
  return <pre>{children}</pre>;
}

const MARKDOWN_COMPONENTS: Components = { a: ExternalLinkAnchor, pre: PreBlock };

const MarkdownChunk = memo(function MarkdownChunk({ text }: { text: string }) {
  return (
    <Markdown
      remarkPlugins={REMARK_PLUGINS}
      rehypePlugins={REHYPE_PLUGINS}
      components={MARKDOWN_COMPONENTS}
    >
      {text}
    </Markdown>
  );
});

function Assistant({ text }: { text: string }) {
  return (
    <div className={ASSISTANT_PROSE_CLASS}>
      <MarkdownChunk text={text} />
    </div>
  );
}

function StreamingAssistant({ text }: { text: string }) {
  const [stable, tail] = splitStableTail(text);
  return (
    <div className={ASSISTANT_PROSE_CLASS}>
      {stable !== "" && <MarkdownChunk text={stable} />}
      {tail !== "" && <MarkdownChunk text={tail} />}
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
  const onTogglePreviewRef = useRef(onTogglePreview);
  onTogglePreviewRef.current = onTogglePreview;
  return (
    <TogglePreviewContext.Provider value={onTogglePreviewRef}>
      {streaming ? <StreamingAssistant text={text} /> : <Assistant text={text} />}
    </TogglePreviewContext.Provider>
  );
}
