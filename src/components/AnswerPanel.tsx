import { useEffect, useRef } from "react";
import { ChevronRight } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ReactNode } from "react";
import { openExternal } from "@/ipc/commands";
import { cn } from "@/lib/utils";

export interface AnswerPanelProps {
  answer: string;
  streaming: boolean;
  expanded: boolean;
  onToggle: () => void;
  onCopy: () => void;
}

export function AnswerPanel({ answer, streaming, expanded, onToggle, onCopy }: AnswerPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (expanded && streaming && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [answer, streaming, expanded]);

  const empty = answer.trim().length === 0;

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
          Ответ
        </button>
        <span className="flex-1 h-px bg-gradient-to-r from-primary/40 via-border to-transparent" aria-hidden />
        {expanded && !empty && !streaming && (
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
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto pr-1.5">
          {empty ? (
            <div className="h-full grid place-items-center">
              <span className="text-[13px] text-muted-foreground">Ответ Claude появится здесь</span>
            </div>
          ) : (
            <div className="prose-answer text-[13.5px] leading-relaxed text-foreground/90">
              <Markdown
                remarkPlugins={[remarkGfm]}
                components={{
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
                }}
              >
                {answer}
              </Markdown>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
