import { Trash2 } from "lucide-react";
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useCopy } from "./copy";
import type { DemoMessage } from "./types";
import { AppIconButton } from "./ui";

const BULLET_PREFIX = "— ";
const SECOND_MS = 1000;

function InlineText({ text }: { text: string }) {
  return (
    <>
      {text
        .split("`")
        .map((part, index) =>
          index % 2 === 1 ? (
            <code key={index}>{part}</code>
          ) : (
            <Fragment key={index}>{part}</Fragment>
          ),
        )}
    </>
  );
}

function withoutBullet(line: string): string {
  return line.startsWith(BULLET_PREFIX) ? line.slice(BULLET_PREFIX.length) : line;
}

function Caret() {
  return (
    <span
      className="caret ml-0.5 inline-block h-3.5 w-0.5 translate-y-0.5 rounded-full bg-app-primary align-baseline"
      aria-hidden
    />
  );
}

function AnswerBody({ text, caret }: { text: string; caret: boolean }) {
  const blocks = text.split("\n\n").filter((block) => block !== "");
  return (
    <div className="app-prose text-app-chat leading-relaxed text-app-fg/90">
      {blocks.map((block, index) => {
        const isLast = index === blocks.length - 1;
        const lines = block.split("\n");
        if (lines[0]?.startsWith(BULLET_PREFIX)) {
          return (
            <ul key={index}>
              {lines.map((line, lineIndex) => (
                <li key={lineIndex}>
                  <InlineText text={withoutBullet(line)} />
                  {caret && isLast && lineIndex === lines.length - 1 && <Caret />}
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={index}>
            <InlineText text={block} />
            {caret && isLast && <Caret />}
          </p>
        );
      })}
    </div>
  );
}

function useElapsedSeconds(startedAt: number) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const read = () => {
      setSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / SECOND_MS)));
    };
    read();
    const id = window.setInterval(read, SECOND_MS);
    return () => {
      clearInterval(id);
    };
  }, [startedAt]);
  return seconds;
}

function ThinkingIndicator({ startedAt }: { startedAt: number }) {
  const copy = useCopy();
  const seconds = useElapsedSeconds(startedAt);
  return (
    <div className="flex items-baseline gap-2">
      <span className="app-shimmer text-app-body font-medium">{copy.hud.thinking}</span>
      <span className="font-mono text-app-caption text-app-muted/60 tabular-nums">
        {seconds}
        {copy.hud.secondsSuffix}
      </span>
    </div>
  );
}

function MessageShell({
  align,
  onRemove,
  children,
}: {
  align: "start" | "end";
  onRemove: () => void;
  children: ReactNode;
}) {
  const copy = useCopy();
  const actions = (
    <div className="pointer-events-none flex shrink-0 gap-0.5 opacity-0 group-hover/msg:pointer-events-auto group-hover/msg:opacity-100">
      <AppIconButton
        title={copy.hud.deleteMessage}
        aria-label={copy.hud.deleteMessage}
        onClick={onRemove}
        className="size-6 rounded-md [&_svg]:size-3.5"
      >
        <Trash2 />
      </AppIconButton>
    </div>
  );
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

export function HudChat({
  messages,
  partial,
  streaming,
  thinkingStartedAt,
  onRemoveMessage,
}: {
  messages: DemoMessage[];
  partial: string | null;
  streaming: boolean;
  thinkingStartedAt: number;
  onRemoveMessage: (index: number) => void;
}) {
  const copy = useCopy();
  const scrollRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages, partial]);

  const empty = messages.length === 0 && partial === null;

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        className="app-scroll flex min-h-0 w-full flex-col gap-3 overflow-y-auto pr-1.5"
      >
        {empty ? (
          <div className="grid h-full place-items-center">
            <span className="text-app-body text-app-muted">{copy.hud.emptyChat}</span>
          </div>
        ) : (
          messages.map((message, index) => (
            <MessageShell
              key={index}
              align={message.role === "user" ? "end" : "start"}
              onRemove={() => {
                onRemoveMessage(index);
              }}
            >
              {message.role === "user" ? (
                <div
                  className={cn(
                    "max-w-[85%] rounded-lg bg-app-surface px-3 py-1.5 text-app-chat break-words",
                    "whitespace-pre-wrap text-app-fg/80",
                  )}
                >
                  {message.text}
                </div>
              ) : (
                <AnswerBody text={message.text} caret={false} />
              )}
            </MessageShell>
          ))
        )}
        {partial !== null && partial !== "" && <AnswerBody text={partial} caret />}
        {streaming && (partial === null || partial === "") && (
          <ThinkingIndicator startedAt={thinkingStartedAt} />
        )}
      </div>
    </section>
  );
}
