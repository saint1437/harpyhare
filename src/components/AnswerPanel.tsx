import { isValidElement, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
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
  /** id активного чата: на переключение прокрутка снова прилипает к низу. */
  chatId?: string;
  /** Текущий in-flight ответ (если идёт стрим активного чата), иначе null. */
  partial: string | null;
  streaming: boolean;
  /** Время начала стрима активного чата (Date.now()) — база счётчика «Думает… Nс». */
  streamStartedAt?: number;
  onCopy: () => void;
  /** Открыть HTML-блок во встроенной панели превью (ошибки обрабатывает владелец). */
  onOpenPreview: (code: string) => void;
}

/** Подсветка кода (highlight.js через rehype): common-набор языков lowlight,
 *  автоопределение для непомеченных блоков ограничено subset'ом (скорость и
 *  стабильность на стриме). `html` — plainText: чип превью требует сырой текст,
 *  подсветка превратила бы children в массив span'ов и сломала бы его. */
const REHYPE_PLUGINS: NonNullable<Parameters<typeof Markdown>[0]["rehypePlugins"]> = [
  [
    rehypeHighlight,
    {
      detect: true,
      plainText: ["html"],
      subset: [
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
      ],
    },
  ],
];

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

/** Один markdown-чанк. memo критичен: во время стрима панель ререндерится на каждый
 *  флаш дельт, и без него react-markdown перепарсивал бы ВСЮ историю каждый раз. */
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
    <div className="prose-answer text-[length:var(--chat-font-size)] leading-relaxed text-foreground/90">
      <MarkdownChunk text={text} components={components} />
    </div>
  );
}

/** Стримящийся ответ: завершённые блоки — стабильный префикс, который парсится один раз
 *  (memo у MarkdownChunk), каждый флаш перепарсивает только активный хвост. */
function StreamingAssistant({ text, components }: { text: string; components: Components }) {
  const [stable, tail] = splitStableTail(text);
  return (
    <div className="prose-answer text-[length:var(--chat-font-size)] leading-relaxed text-foreground/90">
      {stable !== "" && <MarkdownChunk text={stable} components={components} />}
      {tail !== "" && <MarkdownChunk text={tail} components={components} />}
    </div>
  );
}

/** Порог «читатель у низа»: меньше — автоскролл продолжает прилипать. */
const NEAR_BOTTOM_PX = 40;

export function AnswerPanel({
  messages,
  chatId,
  partial,
  streaming,
  streamStartedAt,
  onCopy,
  onOpenPreview,
}: AnswerPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // ref, а не state: значение снимается обработчиком скролла ДО того, как
  // стриминговый ререндер нарастит scrollHeight, и читается эффектом после.
  const nearBottomRef = useRef(true);
  const [showJump, setShowJump] = useState(false);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  // Автоскролл только когда читатель уже у низа — иначе стрим дёргал бы
  // прокрутку на каждый флаш дельт и мешал читать начало длинного ответа.
  useEffect(() => {
    if (nearBottomRef.current) scrollToBottom();
  }, [messages, partial, scrollToBottom]);

  // Переключение чата: показываем свежий низ и сбрасываем «отлип» читателя.
  useEffect(() => {
    nearBottomRef.current = true;
    setShowJump(false);
    scrollToBottom();
  }, [chatId, scrollToBottom]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    nearBottomRef.current = near;
    setShowJump(!near);
  }, []);

  const jumpToBottom = useCallback(() => {
    nearBottomRef.current = true;
    setShowJump(false);
    scrollToBottom();
  }, [scrollToBottom]);

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

      <div className="relative flex min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="flex min-h-0 w-full flex-col gap-3 overflow-y-auto pr-1.5"
        >
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
                    className="max-w-[85%] self-end rounded-lg bg-white/5 px-3 py-1.5 text-[length:var(--chat-font-size)] break-words whitespace-pre-wrap text-foreground/80"
                  >
                    {m.text}
                  </div>
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
          )}
        </div>
        {showJump && (
          <button
            type="button"
            onClick={jumpToBottom}
            className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full border border-border bg-card/90 px-3 py-1 font-mono text-[11px] text-muted-foreground shadow-md backdrop-blur transition-colors hover:text-foreground"
          >
            ↓ Вниз
          </button>
        )}
      </div>
    </section>
  );
}
