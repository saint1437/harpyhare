import { Copy, MessagesSquare, RotateCw, Trash2 } from "lucide-react";
import {
  isValidElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode, RefObject } from "react";
import { type Components } from "react-markdown";
import { HtmlBlockChip } from "@/components/HtmlBlockChip";
import { IconButton } from "@/components/IconButton";
import { markdownComponents, PROSE_MARKDOWN_CLASS } from "@/components/markdown-config";
import { MarkdownChunk } from "@/components/MarkdownChunk";
import { ThinkingIndicator } from "@/components/ThinkingIndicator";
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
const HTML_LANGUAGE_CLASS = "language-html";
const ASSISTANT_PROSE_CLASS = PROSE_MARKDOWN_CLASS;

const FLOATING_CHIP_CLASS = "border bg-popover/95 shadow-pop backdrop-blur-sm";
const MESSAGE_IMAGE_ALT = "Картинка в сообщении";
const COPY_MESSAGE_TITLE = "Копировать сообщение";
const ASSISTANT_ACTIONS_GUTTER_CLASS = "pr-13.5";

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

function MessageActionButton({
  title,
  onClick,
  className,
  children,
}: {
  title: string;
  onClick: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <IconButton title={title} onClick={onClick} className={cn("size-6", className)}>
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
      <MessageActionButton
        title="Удалить сообщение"
        onClick={onRemove}
        className="hover:text-destructive"
      >
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
      <div className="flex flex-col items-center gap-2.5 text-center">
        <span className="grid size-9 place-items-center rounded-lg bg-surface ring-1 ring-border ring-inset">
          <MessagesSquare className="size-4 text-muted-foreground" aria-hidden />
        </span>
        <span className="text-body text-muted-foreground">Чат появится здесь</span>
      </div>
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
    <div className="flex max-w-[85%] flex-col gap-1.5 rounded-lg bg-surface px-3 py-1.5 text-chat text-foreground/90 ring-1 ring-border/50 ring-inset">
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
        "absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full px-2.5 py-1 text-caption text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 active:bg-surface-active",
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
          className="flex min-h-0 w-full flex-col gap-2.5 overflow-y-auto pr-1.5"
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
