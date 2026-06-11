import { isValidElement, useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { HtmlBlockChip } from "@/components/HtmlBlockChip";
import { ThinkingIndicator } from "@/components/ThinkingIndicator";
import { openExternal } from "@/ipc/commands";
import type { ChatMessage } from "@/lib/chats";

export interface AnswerPanelProps {
  messages: ChatMessage[];
  /** Текущий in-flight ответ (если идёт стрим активного чата), иначе null. */
  partial: string | null;
  streaming: boolean;
  /** Время начала стрима активного чата (Date.now()) — база счётчика «Думает… Nс». */
  streamStartedAt?: number;
  onCopy: () => void;
  /** Открыть HTML-блок во встроенной панели превью (ошибки обрабатывает владелец). */
  onOpenPreview: (code: string) => void;
}

const markdownComponents = {
  a: ({ href, children }: { href?: string; children?: ReactNode }) => (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        if (href && /^https?:\/\//.test(href)) void openExternal(href);
      }}
      className="text-primary underline underline-offset-2 hover:brightness-125"
    >
      {children}
    </a>
  ),
};

/** ```html-блок → чип превью; остальные языки — обычный <pre>.
 *  Семантика «что считается html-блоком» должна оставаться согласованной
 *  с lib/html-blocks.ts (автооткрытие): line-start ```html без инфо-строки.
 *  Точное сравнение токена класса — чтобы language-html-template и т.п. не матчились. */
function makePre(onOpenPreview: (code: string) => void) {
  return function PreBlock({ children }: { children?: ReactNode }) {
    const code = isValidElement<{ className?: string; children?: ReactNode }>(children)
      ? children
      : null;
    const text = code?.props.children;
    const isHtml = (code?.props.className ?? "")
      .split(/\s+/)
      .some((c) => c.toLowerCase() === "language-html");
    if (code && isHtml && typeof text === "string") {
      return (
        <HtmlBlockChip
          code={text}
          onOpen={() => {
            onOpenPreview(text);
          }}
        />
      );
    }
    return <pre>{children}</pre>;
  };
}

function Assistant({ text, components }: { text: string; components: Components }) {
  return (
    <div className="prose-answer text-[13.5px] leading-relaxed text-foreground/90">
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </Markdown>
    </div>
  );
}

export function AnswerPanel({
  messages,
  partial,
  streaming,
  streamStartedAt,
  onCopy,
  onOpenPreview,
}: AnswerPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, partial]);

  const components = useMemo<Components>(
    () => ({ ...markdownComponents, pre: makePre(onOpenPreview) }),
    [onOpenPreview],
  );

  const empty = messages.length === 0 && !partial;
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const canCopy = !streaming && lastAssistant !== undefined;

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center gap-2.5">
        <span className="font-mono text-[11px] tracking-wider text-primary uppercase">Чат</span>
        <span
          className="h-px flex-1 bg-gradient-to-r from-primary/40 via-border to-transparent"
          aria-hidden
        />
        {canCopy && (
          <button
            type="button"
            onClick={onCopy}
            className="font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            Копировать
          </button>
        )}
      </div>

      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1.5">
        {empty ? (
          <div className="grid h-full place-items-center">
            <span className="text-[13px] text-muted-foreground">Чат появится здесь</span>
          </div>
        ) : (
          <>
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div
                  key={i}
                  className="max-w-[85%] self-end rounded-lg bg-white/5 px-3 py-1.5 text-[13px] break-words whitespace-pre-wrap text-foreground/80"
                >
                  {m.text}
                </div>
              ) : (
                <Assistant key={i} text={m.text} components={components} />
              ),
            )}
            {partial !== null && partial !== "" && (
              <Assistant text={partial} components={components} />
            )}
            {streaming && (partial === null || partial === "") && (
              <ThinkingIndicator startedAt={streamStartedAt ?? Date.now()} />
            )}
          </>
        )}
      </div>
    </section>
  );
}
