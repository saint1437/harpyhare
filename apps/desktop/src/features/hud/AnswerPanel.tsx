import { Copy, MessagesSquare, RotateCw, Trash2 } from "lucide-react";
import { lazy, memo, Suspense, useEffect, useMemo, useRef } from "react";
import type { ReactNode, RefObject } from "react";
import { IconButton } from "@/components/IconButton";
import { ThinkingIndicator } from "@/features/hud/ThinkingIndicator";
import { useDict } from "@/hooks/useDict";
import type { ScrollMetrics } from "@/lib/chat-scroll";
import type { ChatMessage } from "@/lib/chats";
import { imageDataUrl, type ImagePayload } from "@/lib/composer";
import { matchesModifier, parseModifier } from "@/lib/hotkey-modifier";
import { formatCombo, hotkeyAction, hotkeyHint } from "@/lib/hotkeys";
import { isMessageCopyable } from "@/lib/message-clipboard";
import { cn } from "@/lib/utils";
import { ASSISTANT_PROSE_CLASS } from "./answer-prose";
import { useChatScroll, type ChatScroller } from "./useChatScroll";

/**
 * The markdown pipeline — react-markdown + micromark + highlight.js, the larger
 * half of the HUD's JavaScript — is fetched when the first answer needs it, not
 * when the window opens. An empty chat renders nothing from it.
 */
const AnswerMarkdown = lazy(() => import("./AnswerMarkdown"));

/**
 * The boundary is around ONE answer, not around the message list: suspending the
 * list would blank the user's own bubbles too and remount them (which, among
 * other things, rebuilds every image's data URL). The fallback is the answer's
 * raw text, so nothing disappears while the chunk arrives.
 */
function LazyAnswer({
  text,
  streaming,
  onTogglePreview,
}: {
  text: string;
  streaming: boolean;
  onTogglePreview: (code: string) => void;
}) {
  return (
    <div className={ASSISTANT_PROSE_CLASS}>
      <Suspense fallback={<span className="whitespace-pre-wrap">{text}</span>}>
        <AnswerMarkdown text={text} streaming={streaming} onTogglePreview={onTogglePreview} />
      </Suspense>
    </div>
  );
}

export interface AnswerPanelProps {
  messages: ChatMessage[];
  /** Комбинация записи из реестра: пустой чат — единственное место, где её
   *  можно показать в тот момент, когда она нужна. Экран, где она описана,
   *  уничтожается ровно при запуске HUD. */
  recordCombo: string;
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

const RECORD_ACTION = "record";
const FALLBACK_SCROLL_STEP_PX = 120;

const FLOATING_CHIP_CLASS = "border bg-elevated/95 shadow-pop backdrop-blur-sm";
/**
 * Показ по наведению — без transition: анимация прозрачности в прозрачном
 * безрамочном окне поднимает элемент в отдельный слой WKWebView, и при схлопывании
 * слоя остаются несмытые пиксели.
 */
const REVEAL_ON_HOVER =
  "pointer-events-none opacity-0 group-hover/msg:pointer-events-auto group-hover/msg:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100";

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
  const copy = useDict().hud.answer;
  return (
    <div className="flex shrink-0 gap-0.5">
      {onCopy && (
        <MessageActionButton title={copy.copyMessage} onClick={onCopy}>
          <Copy className="size-3.5" />
        </MessageActionButton>
      )}
      {onResend && (
        <MessageActionButton title={copy.resendMessage} onClick={onResend}>
          <RotateCw className="size-3.5" />
        </MessageActionButton>
      )}
      <MessageActionButton
        title={copy.removeMessage}
        onClick={onRemove}
        className="hover:text-danger"
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
  // Своё сообщение — пузырь, он никогда не занимает всю ширину, поэтому кнопки
  // помещаются в свободную зону слева и ничего не отнимают.
  if (align === "end") {
    return (
      <div className="group/msg flex items-start justify-end gap-1">
        <div className={cn("shrink-0 rounded-md p-0.5", FLOATING_CHIP_CLASS, REVEAL_ON_HOVER)}>
          {actions}
        </div>
        {children}
      </div>
    );
  }
  /**
   * У ответа свободной зоны нет: он тянется на всю ширину. Раньше под кнопки
   * держался постоянный жёлоб справа (4 + 24 + 2 + 24 = 54px) — чтобы показ по
   * наведению не дёргал вёрстку. Цена оказалась выше пользы: 54px терялись на
   * КАЖДОЙ строке каждого ответа всегда, а в узком окне это пятая часть ширины,
   * и текст ответа оказывался заметно уже своих же сообщений.
   *
   * Теперь кнопки лежат абсолютом и ширины не занимают вовсе. Прежнее правило
   * «не накрывать текст» соблюдено ровно там, где это важно: якорь — правый
   * НИЖНИЙ угол, а последняя строка абзаца почти всегда короткая. Плюс своя
   * непрозрачная подложка, так что накрытое не просвечивает.
   */
  return (
    <div className="group/msg relative">
      {children}
      <div
        className={cn(
          "absolute right-0 bottom-0 rounded-md p-0.5",
          FLOATING_CHIP_CLASS,
          REVEAL_ON_HOVER,
        )}
      >
        {actions}
      </div>
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

/**
 * The panel owns an ordinary scroll container, so its `ChatScroller` is four
 * lines of DOM. The indirection is not for this implementation — it is so the
 * rules in `useChatScroll` survive a virtualiser taking the container over.
 */
function domScroller(ref: RefObject<HTMLDivElement | null>): ChatScroller {
  const metrics = (): ScrollMetrics | null => {
    const el = ref.current;
    if (!el) return null;
    return {
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    };
  };
  return {
    toBottom: () => {
      const el = ref.current;
      if (el) el.scrollTop = el.scrollHeight;
    },
    metrics,
  };
}

function EmptyState({ recordCombo }: { recordCombo: string }) {
  const dict = useDict();
  return (
    <div className="grid h-full place-items-center">
      <div className="flex max-w-72 flex-col items-center gap-2.5 text-center">
        <span className="grid size-9 place-items-center rounded-lg bg-surface ring-1 ring-inset ring-line">
          <MessagesSquare className="size-4 text-fg-subtle" aria-hidden />
        </span>
        {recordCombo === "" ? (
          <span className="text-body text-fg-subtle">{dict.hud.answer.emptyNoRecordCombo}</span>
        ) : (
          <>
            <span className="rounded-md bg-surface px-2 py-1 font-mono text-body font-semibold text-fg ring-1 ring-inset ring-line">
              {formatCombo(recordCombo)}
            </span>
            <span className="text-body text-fg-subtle">
              {hotkeyHint(hotkeyAction(RECORD_ACTION), dict)}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

const MessageImages = memo(function MessageImages({ images }: { images: ImagePayload[] }) {
  const alt = useDict().hud.answer.messageImageAlt;
  if (images.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {images.map((image, i) => (
        <img
          key={i}
          src={imageDataUrl(image)}
          alt={alt}
          className="max-h-48 max-w-full rounded-md object-contain ring-1 ring-inset ring-line"
        />
      ))}
    </div>
  );
});

function UserBubble({ text, images }: { text: string; images: ImagePayload[] }) {
  return (
    <div className="flex max-w-[85%] flex-col gap-1.5 rounded-lg bg-surface px-3 py-1.5 text-chat text-fg/90 ring-1 ring-inset ring-line/50">
      <MessageImages images={images} />
      {text !== "" && <span className="min-w-0 break-words whitespace-pre-wrap">{text}</span>}
    </div>
  );
}

function JumpToBottomButton({ onClick }: { onClick: () => void }) {
  const label = useDict().hud.answer.jumpToBottom;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        FLOATING_CHIP_CLASS,
        "absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full px-2.5 py-1 text-caption text-fg-subtle transition-colors outline-none hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus focus-visible:outline-solid active:bg-surface-active",
      )}
    >
      {label}
    </button>
  );
}

function ChatMessages({
  messages,
  partial,
  streaming,
  streamStartedAt,
  onTogglePreview,
  onCopyMessage,
  onRemoveMessage,
  onResendMessage,
}: {
  messages: ChatMessage[];
  partial: string | null;
  streaming: boolean;
  streamStartedAt?: number;
  onTogglePreview: (code: string) => void;
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
            <LazyAnswer text={m.text} streaming={false} onTogglePreview={onTogglePreview} />
          )}
        </MessageShell>
      ))}
      {partial !== null && partial !== "" && (
        <LazyAnswer text={partial} streaming onTogglePreview={onTogglePreview} />
      )}
      {streaming && (partial === null || partial === "") && (
        <ThinkingIndicator startedAt={streamStartedAt ?? Date.now()} />
      )}
    </>
  );
}

export function AnswerPanel({
  messages,
  recordCombo,
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const scroller = useMemo(() => domScroller(scrollRef), []);
  const { showJump, jumpToBottom, syncJump } = useChatScroll(scroller, chatId, messages, partial);
  useHotkeyScroll(scrollRef, scrollStep ?? FALLBACK_SCROLL_STEP_PX, scrollModifier);

  // Fetched off the startup path but well before it is needed: without this the
  // first token of the first answer would arrive as raw markdown for a frame or
  // two while the chunk loads — a flicker at the most-watched moment there is.
  useEffect(() => {
    void import("./AnswerMarkdown");
  }, []);

  const empty = messages.length === 0 && !partial;

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="relative flex min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={syncJump}
          className="flex min-h-0 w-full flex-col gap-2.5 overflow-y-auto pr-1.5"
        >
          {empty ? (
            <EmptyState recordCombo={recordCombo} />
          ) : (
            <ChatMessages
              messages={messages}
              partial={partial}
              streaming={streaming}
              streamStartedAt={streamStartedAt}
              onTogglePreview={onTogglePreview}
              onCopyMessage={onCopyMessage}
              onRemoveMessage={onRemoveMessage}
              onResendMessage={onResendMessage}
            />
          )}
        </div>
        {showJump && <JumpToBottomButton onClick={jumpToBottom} />}
      </div>
    </section>
  );
}
