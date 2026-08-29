import {
  ChevronDown,
  ChevronUp,
  Copy,
  CornerDownLeft,
  LoaderCircle,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { format } from "@/lib/format";
import { useCopy } from "./copy";
import type { DemoNotification, DemoTurn } from "./types";
import { AppButton, AppIconButton, SectionLabel, StateBadge, SURFACE_CARD } from "./ui";

/**
 * The notification stack sits IN FLOW, above the composer, and not floating.
 *
 * In a 400pt-wide always-on-top window a floating layer covers either the
 * capture indicator or the input field; in flow the answer panel simply gives
 * up the height and takes it back. The container is not rendered at all when
 * the stack is empty, because an empty flex child still eats a `gap`.
 */
function NotificationCard({ item, onDismiss }: { item: DemoNotification; onDismiss: () => void }) {
  const copy = useCopy().hud.notifications;
  const [open, setOpen] = useState(false);

  return (
    <div className="flex w-full min-w-0 flex-col overflow-hidden rounded-lg bg-app-surface shadow-lg ring-1 ring-app-border ring-inset">
      <div className="flex min-w-0 items-start gap-2 py-2 pr-1.5 pl-2.5">
        <span className="mt-0.5">
          <StateBadge tone={item.tone} label={item.title} labelHidden />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 truncate text-app-body font-medium text-app-fg">
              {item.title}
            </span>
            {item.count > 1 && (
              <span className="shrink-0 rounded-sm bg-app-surface-active px-1 text-app-hint text-app-subtle tabular-nums">
                ×{item.count}
              </span>
            )}
          </div>
          <p
            className={cn(
              "text-app-caption break-words whitespace-pre-wrap text-app-muted",
              open ? "max-h-40 overflow-y-auto" : "line-clamp-2",
            )}
          >
            {item.body}
          </p>
          <div className="-ml-1.5 flex items-center gap-0.5 pt-0.5">
            <AppButton
              variant="ghost"
              size="xs"
              className="text-app-subtle"
              onClick={() => {
                setOpen((value) => !value);
              }}
            >
              {open ? <ChevronUp /> : <ChevronDown />}
              {open ? copy.collapse : copy.details}
            </AppButton>
            <AppButton variant="ghost" size="xs" className="text-app-subtle">
              <Copy />
              {copy.copy}
            </AppButton>
          </div>
        </div>
        <AppIconButton title={copy.dismiss} size="icon-xs" onClick={onDismiss}>
          <X />
        </AppIconButton>
      </div>
      <span className="block h-0.5 w-full bg-app-code">
        <span
          className={cn(
            "app-life block h-full",
            item.tone === "danger" ? "bg-app-destructive" : "bg-app-warning",
          )}
          style={{ animationDuration: "9000ms" }}
        />
      </span>
    </div>
  );
}

export function NotificationStack({
  items,
  onDismiss,
}: {
  items: DemoNotification[];
  onDismiss: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="flex shrink-0 flex-col gap-1.5">
      {items.map((item) => (
        <NotificationCard
          key={`${item.id}:${String(item.seq)}`}
          item={item}
          onDismiss={() => {
            onDismiss(item.id);
          }}
        />
      ))}
    </div>
  );
}

/**
 * The auto-mode transcript: both sides of the conversation, with the turns that
 * have already gone to the chat dimmed. Its whole job is to make the answer
 * traceable — you can see what the model was answering.
 */
export function AutoTranscript({
  turns,
  instant,
  onAnswer,
}: {
  turns: DemoTurn[];
  instant: boolean;
  onAnswer: () => void;
}) {
  const copy = useCopy().hud.autoTranscript;
  const listRef = useRef<HTMLDivElement>(null);
  const pending = turns.filter((turn) => !turn.sent).length;

  useEffect(() => {
    const el = listRef.current;
    if (el !== null) el.scrollTop = el.scrollHeight;
  }, [turns]);

  const hint =
    turns.length === 0
      ? copy.empty
      : instant
        ? copy.instant
        : pending === 0
          ? copy.answered
          : format(copy.pending, { count: pending });

  return (
    <div className={cn("flex shrink-0 flex-col gap-1.5 px-2.5 py-2", SURFACE_CARD)}>
      <div className="flex items-center justify-between gap-2">
        <SectionLabel>{copy.title}</SectionLabel>
        <div className="flex items-center gap-2">
          <span className="text-app-hint text-app-subtle">{hint}</span>
          {!instant && (
            <AppButton variant="ghost" size="xs" disabled={pending === 0} onClick={onAnswer}>
              <CornerDownLeft />
              {copy.answer}
            </AppButton>
          )}
        </div>
      </div>
      {turns.length > 0 && (
        <div ref={listRef} className="app-scroll flex max-h-24 flex-col gap-0.5 overflow-y-auto">
          {turns.map((turn, index) => (
            <p
              key={`${String(index)}:${turn.text.slice(0, 16)}`}
              className={cn("text-app-caption", turn.sent ? "text-app-subtle" : "text-app-fg")}
            >
              <span className="text-app-subtle">
                {turn.speaker === "interviewer" ? copy.speakers.interviewer : copy.speakers.user}
                {": "}
              </span>
              {turn.text}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/** The second column. It opens by itself when an answer carries an HTML block. */
export function PreviewPanel({ onClose }: { onClose: () => void }) {
  const copy = useCopy().hud.preview;
  return (
    <aside className="hidden w-64 shrink-0 flex-col gap-2.5 lg:flex">
      <header className="flex min-h-7 items-center gap-1.5">
        <SectionLabel className="min-w-0 flex-1 truncate">{copy.title}</SectionLabel>
        <AppButton variant="ghost" size="compact" className="text-app-subtle">
          {copy.copyCode}
        </AppButton>
        <AppIconButton title={copy.close} onClick={onClose}>
          <X />
        </AppIconButton>
      </header>
      <div className="grid min-h-0 flex-1 place-items-center rounded-lg bg-app-on-scrim p-4 text-center ring-1 ring-app-border ring-inset">
        <p className="text-app-caption text-app-destructive-fg">{copy.body}</p>
      </div>
    </aside>
  );
}

/**
 * The teleprompter. Autoscrolls at a speed you can change, fades at both edges,
 * and holds a focus band across the middle — it is meant to be read from across
 * a desk while you keep looking at the camera.
 */
const EDGE_FADE =
  "linear-gradient(to bottom, transparent 0%, black 26%, black 74%, transparent 100%)";
const SPEED_MIN = 10;
const SPEED_MAX = 150;
const SPEED_STEP = 5;
const FONT_MIN = 20;
const FONT_MAX = 48;
const FONT_STEP = 2;

/**
 * Markdown out, prose in.
 *
 * The teleprompter is the one place the answer is READ ALOUD rather than
 * looked at, and asterisks and backticks read as noise — the app strips them
 * with a dedicated pass (`toReadingText`) for exactly this reason. Fences go
 * entirely: nobody reads a code block off a prompter.
 */
function toReadingText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function Stepper({
  label,
  value,
  onDecrease,
  onIncrease,
}: {
  label: string;
  value: string;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-app-card px-0.5 ring-1 ring-app-border ring-inset">
      <AppIconButton title={`${label} −`} size="icon-xs" onClick={onDecrease}>
        <Minus />
      </AppIconButton>
      <span className="w-14 text-center font-mono text-app-caption text-app-subtle tabular-nums">
        {value}
      </span>
      <AppIconButton title={`${label} +`} size="icon-xs" onClick={onIncrease}>
        <Plus />
      </AppIconButton>
    </div>
  );
}

export function Teleprompter({ text, onClose }: { text: string | null; onClose: () => void }) {
  const copy = useCopy().hud.teleprompterPanel;
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(40);
  const [font, setFont] = useState(28);
  const scrollRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef(0);
  const offsetRef = useRef(0);
  const reading = text === null ? "" : toReadingText(text);

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const step = (now: number) => {
      const el = scrollRef.current;
      const elapsed = Math.min(100, now - last);
      last = now;
      if (el !== null) {
        offsetRef.current += (speed * elapsed) / 1000;
        el.scrollTop = offsetRef.current;
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) {
          setPlaying(false);
          return;
        }
      }
      frameRef.current = requestAnimationFrame(step);
    };
    frameRef.current = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frameRef.current);
    };
  }, [playing, speed]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === " ") {
        event.preventDefault();
        setPlaying((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-app-overlay backdrop-blur-sm">
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          className="app-no-scrollbar h-full overflow-y-auto overscroll-contain"
          style={{ maskImage: EDGE_FADE, WebkitMaskImage: EDGE_FADE }}
        >
          <div
            className="mx-auto max-w-[26ch] px-8 text-center leading-[1.7] font-medium tracking-wide whitespace-pre-wrap text-app-fg/90"
            style={{ fontSize: `${String(font)}px`, paddingTop: "46%", paddingBottom: "54%" }}
          >
            {reading === "" ? copy.empty : reading}
          </div>
        </div>
        <span
          className="pointer-events-none absolute inset-x-0 top-1/2 h-16 -translate-y-1/2 bg-app-primary/10"
          aria-hidden
        />
      </div>
      <div className="flex items-center justify-center gap-1.5 pb-3">
        <AppIconButton
          title={copy.restart}
          onClick={() => {
            offsetRef.current = 0;
            const el = scrollRef.current;
            if (el !== null) el.scrollTop = 0;
            setPlaying(true);
          }}
        >
          <RotateCcw />
        </AppIconButton>
        <AppIconButton
          title={playing ? copy.pause : copy.play}
          onClick={() => {
            setPlaying((value) => !value);
          }}
        >
          {playing ? <Pause /> : <Play />}
        </AppIconButton>
        <Stepper
          label={copy.speed}
          value={String(speed)}
          onDecrease={() => {
            setSpeed((value) => Math.max(SPEED_MIN, value - SPEED_STEP));
          }}
          onIncrease={() => {
            setSpeed((value) => Math.min(SPEED_MAX, value + SPEED_STEP));
          }}
        />
        <Stepper
          label={copy.font}
          value={`${String(font)}px`}
          onDecrease={() => {
            setFont((value) => Math.max(FONT_MIN, value - FONT_STEP));
          }}
          onIncrease={() => {
            setFont((value) => Math.min(FONT_MAX, value + FONT_STEP));
          }}
        />
        <AppIconButton title={copy.close} onClick={onClose}>
          <X />
        </AppIconButton>
      </div>
    </div>
  );
}

/**
 * Offline. The overlay is OPAQUE, not a tint: the app covers the chat entirely
 * so nothing under it can be mistaken for something you can still act on, and
 * while it is up the prompt is released and the hotkeys are inert.
 */
export function ConnectivityOverlay() {
  const copy = useCopy().hud.connectivity;
  return (
    <div className="absolute inset-0 z-50 grid place-items-center rounded-[inherit] bg-app-bg">
      <div className="flex max-w-xs flex-col items-center gap-3 px-6 text-center">
        <LoaderCircle className="size-6 animate-spin text-app-subtle" aria-hidden />
        <p className="text-app-body font-medium text-app-fg">{copy.title}</p>
        <p className="text-app-caption text-app-subtle">{copy.hint}</p>
      </div>
    </div>
  );
}
