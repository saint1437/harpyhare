import { isValidElement, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import Markdown, { type Components } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { HtmlBlockChip } from "@/components/HtmlBlockChip";
import { ThinkingIndicator } from "@/components/ThinkingIndicator";
import { openExternal } from "@/ipc/commands";
import type { ChatMessage } from "@/lib/chats";
import { splitStableTail } from "@/lib/stream-markdown";

export interface AnswerPanelProps {
  messages: ChatMessage[];
  chatId?: string;
  partial: string | null;
  streaming: boolean;
  streamStartedAt?: number;
  scrollStep?: number;
  onTogglePreview: (code: string) => void;
}

const FALLBACK_SCROLL_STEP_PX = 120;

const NEAR_BOTTOM_PX = 40;
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
const ASSISTANT_PROSE_CLASS =
  "prose-answer text-[length:var(--chat-font-size)] leading-relaxed text-foreground/90";

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
      className="text-foreground underline decoration-foreground/40 underline-offset-2 hover:decoration-foreground"
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
    <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={REHYPE_PLUGINS} components={components}>
      {text}
    </Markdown>
  );
});

function Assistant({ text, components }: { text: string; components: Components }) {
  return (
    <div className={`chat-item ${ASSISTANT_PROSE_CLASS}`}>
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

function useHotkeyScroll(scrollRef: RefObject<HTMLDivElement | null>, stepPx: number): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.metaKey || e.ctrlKey) return;
      const dir = e.code === "ArrowDown" ? 1 : e.code === "ArrowUp" ? -1 : 0;
      if (dir === 0) return;
      e.preventDefault();
      scrollRef.current?.scrollBy({ top: dir * stepPx, behavior: "smooth" });
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [scrollRef, stepPx]);
}

function useStickToBottom() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const [showJump, setShowJump] = useState(false);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  const scrollIfNearBottom = useCallback(() => {
    if (nearBottomRef.current) scrollToBottom();
  }, [scrollToBottom]);

  const resetToBottom = useCallback(() => {
    nearBottomRef.current = true;
    setShowJump(false);
    scrollToBottom();
  }, [scrollToBottom]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    nearBottomRef.current = near;
    setShowJump(!near);
  }, []);

  return { scrollRef, showJump, onScroll, scrollIfNearBottom, resetToBottom };
}

function EmptyState() {
  return (
    <div className="grid h-full place-items-center">
      <span className="text-[13px] text-muted-foreground">Чат появится здесь</span>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="chat-item max-w-[85%] self-end rounded-lg bg-white/5 px-3 py-1.5 text-[length:var(--chat-font-size)] break-words whitespace-pre-wrap text-foreground/80">
      {text}
    </div>
  );
}

function JumpToBottomButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full border border-border bg-card/90 px-3 py-1 font-mono text-[11px] text-muted-foreground shadow-md backdrop-blur transition-colors hover:text-foreground"
    >
      ↓ Вниз
    </button>
  );
}

function ChatMessages({
  messages,
  partial,
  streaming,
  streamStartedAt,
  components,
}: {
  messages: ChatMessage[];
  partial: string | null;
  streaming: boolean;
  streamStartedAt?: number;
  components: Components;
}) {
  return (
    <>
      {messages.map((m, i) =>
        m.role === "user" ? (
          <UserBubble key={i} text={m.text} />
        ) : (
          <Assistant key={i} text={m.text} components={components} />
        ),
      )}
      {partial !== null && partial !== "" && (
        <StreamingAssistant text={partial} components={components} />
      )}
      {streaming && (partial === null || partial === "") && (
        <ThinkingIndicator startedAt={streamStartedAt ?? Date.now()} />
      )}
    </>
  );
}

export function AnswerPanel({
  messages,
  chatId,
  partial,
  streaming,
  streamStartedAt,
  scrollStep,
  onTogglePreview,
}: AnswerPanelProps) {
  const { scrollRef, showJump, onScroll, scrollIfNearBottom, resetToBottom } = useStickToBottom();
  useHotkeyScroll(scrollRef, scrollStep ?? FALLBACK_SCROLL_STEP_PX);

  useEffect(() => {
    scrollIfNearBottom();
  }, [messages, partial, scrollIfNearBottom]);

  useEffect(() => {
    resetToBottom();
  }, [chatId, resetToBottom]);

  const components = useMemo<Components>(
    () => ({ ...markdownComponents, pre: makePre(onTogglePreview) }),
    [onTogglePreview],
  );

  const empty = messages.length === 0 && !partial;

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="relative flex min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="flex min-h-0 w-full flex-col gap-3 overflow-y-auto pr-1.5"
        >
          {empty ? (
            <EmptyState />
          ) : (
            <ChatMessages
              messages={messages}
              partial={partial}
              streaming={streaming}
              streamStartedAt={streamStartedAt}
              components={components}
            />
          )}
        </div>
        {showJump && <JumpToBottomButton onClick={resetToBottom} />}
      </div>
    </section>
  );
}
