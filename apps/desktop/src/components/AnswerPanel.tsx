import { Copy, RotateCw, Trash2 } from "lucide-react";
import {
  isValidElement,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode, RefObject } from "react";
import Markdown, { type Components } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { HtmlBlockChip } from "@/components/HtmlBlockChip";
import { IconButton } from "@/components/IconButton";
import { ThinkingIndicator } from "@/components/ThinkingIndicator";
import { openExternal } from "@/ipc/commands";
import type { ChatMessage } from "@/lib/chats";
import { imageDataUrl, type ImagePayload } from "@/lib/composer";
import { matchesModifier, parseModifier } from "@/lib/hotkey-modifier";
import { isMessageCopyable } from "@/lib/message-clipboard";
import { splitStableTail } from "@/lib/stream-markdown";
import { cn } from "@/lib/utils";

export interface AnswerPanelProps {
  messages: ChatMessage[];
  chatId?: string;
  partial: string | null;
  streaming: boolean;
  streamStartedAt?: number;
  scrollStep?: number;
  scrollModifier: string;
  onTogglePreview: (code: string) => void;
  onCopyMessage: (index: number) => void;
  onRemoveMessage: (index: number) => void;
  onResendMessage: (index: number) => void;
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
const ASSISTANT_PROSE_CLASS = "prose-answer text-chat leading-relaxed text-foreground/90";

const FLOATING_CHIP_CLASS = "border bg-popover/95 shadow-md backdrop-blur-sm";
const MESSAGE_IMAGE_ALT = "Картинка в сообщении";
const COPY_MESSAGE_TITLE = "Копировать сообщение";
const ASSISTANT_ACTIONS_GUTTER_CLASS = "pr-13.5";

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

function MessageActionButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <IconButton title={title} onClick={onClick} className="size-6 rounded-md">
      {children}
    </IconButton>
  );
}

function MessageActions({
  onCopy,
  onRemove,
  onResend,
}: {
  onCopy: (() => void) | null;
  onRemove: () => void;
  onResend: (() => void) | null;
}) {
  return (
    <div className="pointer-events-none flex shrink-0 gap-0.5 opacity-0 group-hover/msg:pointer-events-auto group-hover/msg:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100">
      {onCopy && (
        <MessageActionButton title={COPY_MESSAGE_TITLE} onClick={onCopy}>
          <Copy className="size-3.5" />
        </MessageActionButton>
      )}
      {onResend && (
        <MessageActionButton
          title="Переотправить (всё, что ниже, будет заменено новым ответом)"
          onClick={onResend}
        >
          <RotateCw className="size-3.5" />
        </MessageActionButton>
      )}
      <MessageActionButton title="Удалить сообщение" onClick={onRemove}>
        <Trash2 className="size-3.5" />
      </MessageActionButton>
    </div>
  );
}

function MessageShell({
  align,
  onCopy,
  onRemove,
  onResend,
  children,
}: {
  align: "start" | "end";
  onCopy: (() => void) | null;
  onRemove: () => void;
  onResend: (() => void) | null;
  children: ReactNode;
}) {
  const actions = <MessageActions onCopy={onCopy} onRemove={onRemove} onResend={onResend} />;
  if (align === "end") {
    return (
      <div className="group/msg flex items-start justify-end gap-1">
        {actions}
        {children}
      </div>
    );
  }
  return (
    <div className="group/msg flex items-start gap-1">
      <div className="min-w-0 flex-1">{children}</div>
      {actions}
    </div>
  );
}

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
    <div className={cn(ASSISTANT_PROSE_CLASS, ASSISTANT_ACTIONS_GUTTER_CLASS)}>
      {stable !== "" && <MarkdownChunk text={stable} components={components} />}
      {tail !== "" && <MarkdownChunk text={tail} components={components} />}
    </div>
  );
}

function useHotkeyScroll(
  scrollRef: RefObject<HTMLDivElement | null>,
  stepPx: number,
  modifier: string,
): void {
  useEffect(() => {
    const expected = parseModifier(modifier);
    const onKey = (e: KeyboardEvent) => {
      const dir = e.code === "ArrowDown" ? 1 : e.code === "ArrowUp" ? -1 : 0;
      if (dir === 0) return;
      if (!matchesModifier(e, expected)) return;
      e.preventDefault();
      scrollRef.current?.scrollBy({ top: dir * stepPx, behavior: "smooth" });
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [scrollRef, stepPx, modifier]);
}

function useStickToBottom() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showJump, setShowJump] = useState(false);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  const syncJump = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    setShowJump(!near && el.scrollHeight > el.clientHeight);
  }, []);

  const resetToBottom = useCallback(() => {
    scrollToBottom();
    setShowJump(false);
  }, [scrollToBottom]);

  const onScroll = syncJump;

  return { scrollRef, showJump, onScroll, resetToBottom, syncJump };
}

function EmptyState() {
  return (
    <div className="grid h-full place-items-center">
      <span className="text-body text-muted-foreground">Чат появится здесь</span>
    </div>
  );
}

function MessageImages({ images }: { images: ImagePayload[] }) {
  if (images.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {images.map((image, i) => (
        <img
          key={i}
          src={imageDataUrl(image)}
          alt={MESSAGE_IMAGE_ALT}
          className="max-h-48 max-w-full rounded-md object-contain ring-1 ring-border ring-inset"
        />
      ))}
    </div>
  );
}

function UserBubble({ text, images }: { text: string; images: ImagePayload[] }) {
  return (
    <div className="flex max-w-[85%] flex-col gap-1.5 rounded-lg bg-surface px-3 py-1.5 text-chat text-foreground/80">
      <MessageImages images={images} />
      {text !== "" && <span className="min-w-0 break-words whitespace-pre-wrap">{text}</span>}
    </div>
  );
}

function JumpToBottomButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        FLOATING_CHIP_CLASS,
        "absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-caption text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
      )}
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
  onCopyMessage,
  onRemoveMessage,
  onResendMessage,
}: {
  messages: ChatMessage[];
  partial: string | null;
  streaming: boolean;
  streamStartedAt?: number;
  components: Components;
  onCopyMessage: (index: number) => void;
  onRemoveMessage: (index: number) => void;
  onResendMessage: (index: number) => void;
}) {
  return (
    <>
      {messages.map((m, i) => (
        <MessageShell
          key={i}
          align={m.role === "user" ? "end" : "start"}
          onCopy={
            isMessageCopyable(m)
              ? () => {
                  onCopyMessage(i);
                }
              : null
          }
          onRemove={() => {
            onRemoveMessage(i);
          }}
          onResend={
            m.role === "user" && !streaming
              ? () => {
                  onResendMessage(i);
                }
              : null
          }
        >
          {m.role === "user" ? (
            <UserBubble text={m.text} images={m.images} />
          ) : (
            <Assistant text={m.text} components={components} />
          )}
        </MessageShell>
      ))}
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
  scrollModifier,
  onTogglePreview,
  onCopyMessage,
  onRemoveMessage,
  onResendMessage,
}: AnswerPanelProps) {
  const { scrollRef, showJump, onScroll, resetToBottom, syncJump } = useStickToBottom();
  useHotkeyScroll(scrollRef, scrollStep ?? FALLBACK_SCROLL_STEP_PX, scrollModifier);

  useLayoutEffect(() => {
    resetToBottom();
  }, [chatId, resetToBottom]);

  const prevMessageCount = useRef(0);
  useEffect(() => {
    const grew = messages.length > prevMessageCount.current;
    prevMessageCount.current = messages.length;
    if (grew && messages[messages.length - 1]?.role === "user") resetToBottom();
    else syncJump();
  }, [messages, resetToBottom, syncJump]);

  useEffect(() => {
    syncJump();
  }, [partial, syncJump]);

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
              onCopyMessage={onCopyMessage}
              onRemoveMessage={onRemoveMessage}
              onResendMessage={onResendMessage}
            />
          )}
        </div>
        {showJump && <JumpToBottomButton onClick={resetToBottom} />}
      </div>
    </section>
  );
}
