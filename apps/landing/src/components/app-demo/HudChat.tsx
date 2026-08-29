import { Copy, ExternalLink, MessagesSquare, RotateCw, Trash2 } from "lucide-react";
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { format } from "@/lib/format";
import { useCopy } from "./copy";
import type { DemoMessage } from "./types";
import { AppIconButton } from "./ui";

/** `NEAR_BOTTOM_PX` in `apps/desktop/src/lib/chat-scroll.ts`. */
const NEAR_BOTTOM_PX = 40;

/**
 * Inline marks: `**bold**` and `` `code` ``.
 *
 * The old demo did the same job with two ad-hoc rules and produced markup for
 * neither headings nor fences, so an answer written in the app's voice rendered
 * here as one grey paragraph with backticks in it. This is still not a markdown
 * parser — it is the subset the seeded answers use, kept small on purpose.
 */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((piece, index) => {
    const key = `${String(index)}:${piece}`;
    if (piece.startsWith("**") && piece.endsWith("**") && piece.length > 4) {
      return <strong key={key}>{piece.slice(2, -2)}</strong>;
    }
    if (piece.startsWith("`") && piece.endsWith("`") && piece.length > 2) {
      return <code key={key}>{piece.slice(1, -1)}</code>;
    }
    return <Fragment key={key}>{piece}</Fragment>;
  });
}

interface Block {
  kind: "p" | "h3" | "ul" | "ol" | "pre";
  lines: string[];
  language?: string;
}

/**
 * Block-level split. Fences are taken first and verbatim, because everything
 * else — blank lines, list bullets, hashes — is ordinary text inside one.
 */
function toBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  const lines = text.split("\n");
  let buffer: string[] = [];

  const flush = () => {
    if (buffer.length === 0) return;
    const first = buffer[0] ?? "";
    if (first.startsWith("### ")) {
      blocks.push({ kind: "h3", lines: [first.slice(4)] });
    } else if (/^[-*] /.test(first)) {
      blocks.push({ kind: "ul", lines: buffer.map((line) => line.replace(/^[-*] /, "")) });
    } else if (/^\d+\. /.test(first)) {
      blocks.push({ kind: "ol", lines: buffer.map((line) => line.replace(/^\d+\. /, "")) });
    } else {
      blocks.push({ kind: "p", lines: buffer });
    }
    buffer = [];
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (line.startsWith("```")) {
      flush();
      const language = line.slice(3).trim();
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !(lines[i] ?? "").startsWith("```")) {
        body.push(lines[i] ?? "");
        i += 1;
      }
      blocks.push({ kind: "pre", lines: body, language });
      continue;
    }
    if (line.trim() === "") {
      flush();
      continue;
    }
    buffer.push(line);
  }
  flush();
  return blocks;
}

/**
 * An `html` fence never renders as a code block in the app: it collapses to a
 * chip that opens the preview column. Keeping that here is the only way the
 * demo can show the preview panel at all.
 */
function HtmlBlockChip({ lines, onOpen }: { lines: number; onOpen: () => void }) {
  const copy = useCopy().hud.htmlBlock;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="my-1.5 flex items-center gap-2 rounded-md bg-app-code px-2.5 py-1.5 font-mono text-app-caption text-app-subtle ring-1 ring-app-border transition-colors outline-none ring-inset hover:text-app-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus focus-visible:outline-solid active:bg-app-card"
    >
      <span className="font-medium text-app-fg/85">html</span>
      <span className="tabular-nums">{format(copy.lines, { count: lines })}</span>
      <span className="flex items-center gap-1">
        {copy.openPreview}
        <ExternalLink className="size-3" aria-hidden />
      </span>
    </button>
  );
}

function Answer({ text, onOpenPreview }: { text: string; onOpenPreview: () => void }) {
  return (
    <div className="app-prose text-app-chat leading-relaxed text-app-fg/90">
      {toBlocks(text).map((block, index) => {
        const key = `${String(index)}:${block.kind}`;
        if (block.kind === "pre") {
          if (block.language === "html") {
            return <HtmlBlockChip key={key} lines={block.lines.length} onOpen={onOpenPreview} />;
          }
          return (
            <pre key={key}>
              <code>{block.lines.join("\n")}</code>
            </pre>
          );
        }
        if (block.kind === "h3") return <h3 key={key}>{inline(block.lines.join(" "))}</h3>;
        if (block.kind === "ul") {
          return (
            <ul key={key}>
              {block.lines.map((line, i) => (
                <li key={`${String(i)}:${line}`}>{inline(line)}</li>
              ))}
            </ul>
          );
        }
        if (block.kind === "ol") {
          return (
            <ol key={key}>
              {block.lines.map((line, i) => (
                <li key={`${String(i)}:${line}`}>{inline(line)}</li>
              ))}
            </ol>
          );
        }
        return <p key={key}>{inline(block.lines.join(" "))}</p>;
      })}
    </div>
  );
}

/**
 * The hover-revealed action chips.
 *
 * There is deliberately no `transition-opacity` here, and it is copied from the
 * app rather than forgotten: promoting and then collapsing a compositing layer
 * inside a transparent WKWebView window leaves un-cleared pixels behind.
 */
const FLOATING_CHIP = "rounded-md border border-app-border bg-app-surface/95 p-0.5 shadow-lg";
const REVEAL_ON_HOVER =
  "pointer-events-none opacity-0 group-hover/msg:pointer-events-auto group-hover/msg:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100";

function MessageActions({
  onCopy,
  onResend,
  onRemove,
}: {
  onCopy: () => void;
  onResend?: () => void;
  onRemove: () => void;
}) {
  const copy = useCopy().hud.answer;
  return (
    <div className="flex shrink-0 gap-0.5">
      <AppIconButton title={copy.copyMessage} size="icon-xs" onClick={onCopy}>
        <Copy />
      </AppIconButton>
      {onResend !== undefined && (
        <AppIconButton title={copy.resendMessage} size="icon-xs" onClick={onResend}>
          <RotateCw />
        </AppIconButton>
      )}
      <AppIconButton
        title={copy.removeMessage}
        size="icon-xs"
        className="hover:text-app-destructive"
        onClick={onRemove}
      >
        <Trash2 />
      </AppIconButton>
    </div>
  );
}

function UserMessage({
  text,
  attachments,
  streaming,
  onCopy,
  onResend,
  onRemove,
}: {
  text: string;
  attachments: number;
  streaming: boolean;
  onCopy: () => void;
  onResend: () => void;
  onRemove: () => void;
}) {
  const copy = useCopy().hud;
  return (
    <div className="group/msg flex items-start justify-end gap-1">
      <div className={cn("shrink-0", FLOATING_CHIP, REVEAL_ON_HOVER)}>
        <MessageActions
          onCopy={onCopy}
          onResend={streaming ? undefined : onResend}
          onRemove={onRemove}
        />
      </div>
      <div className="flex max-w-[85%] flex-col gap-1.5 rounded-lg bg-app-card px-3 py-1.5 text-app-chat text-app-fg/90 ring-1 ring-app-border/50 ring-inset">
        {attachments > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: attachments }, (_, index) => (
              <span
                key={index}
                aria-label={copy.composer.attachmentAlt}
                className="grid size-12 place-items-center rounded-md bg-app-code text-app-subtle ring-1 ring-app-border ring-inset"
              >
                <MessagesSquare className="size-4" aria-hidden />
              </span>
            ))}
          </div>
        )}
        <span className="min-w-0 break-words whitespace-pre-wrap">{text}</span>
      </div>
    </div>
  );
}

function ThinkingIndicator({ startedAt }: { startedAt: number }) {
  const copy = useCopy().hud.thinking;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(id);
    };
  }, []);

  const elapsed = Math.max(0, Math.floor((now - startedAt) / 1000));
  const readout =
    elapsed < 60
      ? format(copy.seconds, { seconds: elapsed })
      : format(copy.minutes, { minutes: Math.floor(elapsed / 60), seconds: elapsed % 60 });

  return (
    <div className="flex items-baseline gap-2">
      <span className="app-shimmer text-app-body font-medium">{copy.label}</span>
      <span className="font-mono text-app-caption text-app-subtle/60 tabular-nums">{readout}</span>
    </div>
  );
}

function EmptyState({ combo }: { combo: string }) {
  const copy = useCopy().hud.answer;
  return (
    <div className="grid h-full place-items-center">
      <div className="flex max-w-72 flex-col items-center gap-2.5 text-center">
        <span className="grid size-9 place-items-center rounded-lg bg-app-card ring-1 ring-app-border ring-inset">
          <MessagesSquare className="size-4 text-app-subtle" aria-hidden />
        </span>
        {combo === "" ? (
          <p className="text-app-body text-app-subtle">{copy.emptyNoCombo}</p>
        ) : (
          <>
            <span className="rounded-md bg-app-card px-2 py-1 font-mono text-app-body font-semibold text-app-fg ring-1 ring-app-border ring-inset">
              {combo}
            </span>
            <p className="text-app-body text-app-subtle">{copy.emptyHint}</p>
          </>
        )}
      </div>
    </div>
  );
}

export function HudChat({
  chatId,
  messages,
  attachments,
  partial,
  streaming,
  thinkingStartedAt,
  recordCombo,
  onRemoveMessage,
  onResendMessage,
  onOpenPreview,
}: {
  chatId: string;
  messages: DemoMessage[];
  attachments: number;
  partial: string | null;
  streaming: boolean;
  thinkingStartedAt: number;
  recordCombo: string;
  onRemoveMessage: (index: number) => void;
  onResendMessage: (index: number) => void;
  onOpenPreview: () => void;
}) {
  const copy = useCopy().hud.answer;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showJump, setShowJump] = useState(false);
  const lastCountRef = useRef(messages.length);

  const syncJump = () => {
    const el = scrollRef.current;
    if (el === null) return;
    const distance = el.scrollHeight - el.clientHeight - el.scrollTop;
    setShowJump(el.scrollHeight > el.clientHeight && distance >= NEAR_BOTTOM_PX);
  };

  // Rule 1: a chat switch lands at the bottom, before paint.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el !== null) el.scrollTop = el.scrollHeight;
    lastCountRef.current = messages.length;
    // The message count is intentionally not a dependency: this effect is about
    // the chat changing under the panel, not about the panel's own growth.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  // Rule 2: YOUR new message scrolls; an assistant message appended at the end
  // of a stream does not. Rule 3 — no autoscroll while streaming — is the
  // absence of any effect on `partial`.
  useEffect(() => {
    const grew = messages.length > lastCountRef.current;
    lastCountRef.current = messages.length;
    const last = messages[messages.length - 1];
    if (grew && last?.role === "user") {
      const el = scrollRef.current;
      if (el !== null) el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const empty = messages.length === 0 && partial === null;

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="relative flex min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={syncJump}
          className="app-scroll flex min-h-0 w-full flex-col gap-2.5 overflow-y-auto pr-1.5"
        >
          {empty ? (
            <EmptyState combo={recordCombo} />
          ) : (
            <>
              {messages.map((message, index) =>
                message.role === "user" ? (
                  <UserMessage
                    key={`${String(index)}:${message.text.slice(0, 24)}`}
                    text={message.text}
                    attachments={index === messages.length - 1 ? attachments : 0}
                    streaming={streaming}
                    onCopy={() => undefined}
                    onResend={() => {
                      onResendMessage(index);
                    }}
                    onRemove={() => {
                      onRemoveMessage(index);
                    }}
                  />
                ) : (
                  <div
                    key={`${String(index)}:${message.text.slice(0, 24)}`}
                    className="group/msg relative"
                  >
                    <Answer text={message.text} onOpenPreview={onOpenPreview} />
                    <div
                      className={cn("absolute right-0 bottom-0", FLOATING_CHIP, REVEAL_ON_HOVER)}
                    >
                      <MessageActions
                        onCopy={() => undefined}
                        onRemove={() => {
                          onRemoveMessage(index);
                        }}
                      />
                    </div>
                  </div>
                ),
              )}
              {partial !== null && partial !== "" && (
                <Answer text={partial} onOpenPreview={onOpenPreview} />
              )}
              {streaming && (partial === null || partial === "") && (
                <ThinkingIndicator startedAt={thinkingStartedAt} />
              )}
            </>
          )}
        </div>
        {showJump && (
          <button
            type="button"
            onClick={() => {
              const el = scrollRef.current;
              if (el !== null) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
            }}
            className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full border border-app-border bg-app-surface/95 px-2.5 py-1 text-app-caption text-app-subtle shadow-lg transition-colors outline-none hover:text-app-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus focus-visible:outline-solid"
          >
            {copy.jumpToBottom}
          </button>
        )}
      </div>
    </section>
  );
}
