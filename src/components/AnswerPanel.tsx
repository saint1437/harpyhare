import { useEffect, useRef } from "react";
import { ChevronRight } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ReactNode } from "react";
import { openExternal } from "@/ipc/commands";
import type { ChatMessage } from "@/lib/chats";
import { cn } from "@/lib/utils";

export interface AnswerPanelProps {
  messages: ChatMessage[];
  /** Текущий in-flight ответ (если идёт стрим активного чата), иначе null. */
  partial: string | null;
  streaming: boolean;
  expanded: boolean;
  onToggle: () => void;
  onCopy: () => void;
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

function Assistant({ text }: { text: string }) {
  return (
    <div className="prose-answer text-[13.5px] leading-relaxed text-foreground/90">
      <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {text}
      </Markdown>
    </div>
  );
}

export function AnswerPanel({
  messages,
  partial,
  streaming,
  expanded,
  onToggle,
  onCopy,
}: AnswerPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (expanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, partial, expanded]);

  const empty = messages.length === 0 && !partial;
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const canCopy = expanded && !streaming && lastAssistant !== undefined;

  return (
    <section className="flex-1 min-h-0 flex flex-col gap-2">
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex items-center gap-1 font-mono text-[11px] uppercase tracking-wider text-primary hover:brightness-125"
        >
          <ChevronRight className={cn("size-3.5 transition-transform", expanded && "rotate-90")} />
          Диалог
        </button>
        <span className="flex-1 h-px bg-gradient-to-r from-primary/40 via-border to-transparent" aria-hidden />
        {canCopy && (
          <button
            type="button"
            onClick={onCopy}
            className="font-mono text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            Копировать
          </button>
        )}
      </div>

      {expanded && (
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto pr-1.5 flex flex-col gap-3">
          {empty ? (
            <div className="h-full grid place-items-center">
              <span className="text-[13px] text-muted-foreground">Диалог появится здесь</span>
            </div>
          ) : (
            <>
              {messages.map((m, i) =>
                m.role === "user" ? (
                  <div
                    key={i}
                    className="self-end max-w-[85%] rounded-lg bg-white/5 px-3 py-1.5 text-[13px] text-foreground/80 whitespace-pre-wrap break-words"
                  >
                    {m.text}
                  </div>
                ) : (
                  <Assistant key={i} text={m.text} />
                ),
              )}
              {partial !== null && partial !== "" && <Assistant text={partial} />}
            </>
          )}
        </div>
      )}
    </section>
  );
}
