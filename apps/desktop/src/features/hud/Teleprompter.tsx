import { Minus, Pause, Play, Plus, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { IconButton } from "@/components/IconButton";
import { useDict } from "@/hooks/useDict";
import { matchesPrepared, prepareCombo } from "@/lib/hotkey-match";
import {
  advanceOffset,
  clampFont,
  clampSpeed,
  TELEPROMPTER_FONT_STEP,
  TELEPROMPTER_SPEED_STEP,
} from "@/lib/teleprompter";

export interface TeleprompterProps {
  text: string;
  initialSpeed: number;
  initialFontSize: number;
  initialOffset: number;
  onPersist: (speed: number, fontSize: number, offset: number) => void;
  onClose: () => void;
  closeCombo: string;
  pauseCombo: string;
}

const EDGE_FADE =
  "linear-gradient(to bottom, transparent 0%, black 26%, black 74%, transparent 100%)";

export function Teleprompter({
  text,
  initialSpeed,
  initialFontSize,
  initialOffset,
  closeCombo,
  pauseCombo,
  onPersist,
  onClose,
}: TeleprompterProps) {
  const copy = useDict().hud.teleprompter;
  const [speed, setSpeed] = useState(() => clampSpeed(initialSpeed));
  const [fontSize, setFontSize] = useState(() => clampFont(initialFontSize));
  const [playing, setPlaying] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(initialOffset);
  const lastTsRef = useRef(0);
  const maxOffsetRef = useRef(0);
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const fontSizeRef = useRef(fontSize);
  fontSizeRef.current = fontSize;
  const onPersistRef = useRef(onPersist);
  onPersistRef.current = onPersist;

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = offsetRef.current;
  }, []);

  /**
   * How far the reading can still travel. It is measured here and not inside
   * the tick below: reading `scrollHeight`/`clientHeight` and then writing
   * `scrollTop` in the same frame forces the layout the write had just
   * invalidated, sixty times a second. Nothing changes it except the text, the
   * font size and the window — and the observer covers the last of the three.
   */
  const measure = useCallback(() => {
    const el = scrollRef.current;
    maxOffsetRef.current = el === null ? 0 : el.scrollHeight - el.clientHeight;
  }, []);

  useLayoutEffect(measure, [measure, text, fontSize]);

  useEffect(() => {
    const viewport = scrollRef.current;
    const content = contentRef.current;
    if (viewport === null || content === null) return;
    // The viewport for the window's height, the column for the text's own —
    // `scrollHeight` answers to the second and `clientHeight` to the first.
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(content);
    return () => {
      observer.disconnect();
    };
  }, [measure]);

  /**
   * The loop exists only while it has something to do. It used to reschedule
   * itself outside the `playing` guard, so a paused teleprompter — and one that
   * had reached the end, which pauses itself — went on waking the main thread
   * sixty times a second above a window that was not moving.
   */
  useEffect(() => {
    if (!playing) return;
    lastTsRef.current = 0;
    let raf = 0;
    const tick = (ts: number) => {
      const el = scrollRef.current;
      if (el) {
        const elapsed = lastTsRef.current === 0 ? 0 : ts - lastTsRef.current;
        lastTsRef.current = ts;
        const maxOffset = maxOffsetRef.current;
        offsetRef.current = advanceOffset(offsetRef.current, speedRef.current, elapsed, maxOffset);
        el.scrollTop = offsetRef.current;
        if (offsetRef.current >= maxOffset) {
          setPlaying(false);
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [playing]);

  useEffect(() => {
    return () => {
      onPersistRef.current(speedRef.current, fontSizeRef.current, offsetRef.current);
    };
  }, []);

  const syncOffsetFromScroll = useCallback(() => {
    if (scrollRef.current) offsetRef.current = scrollRef.current.scrollTop;
  }, []);

  const restart = useCallback(() => {
    offsetRef.current = 0;
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setPlaying(true);
  }, []);

  useEffect(() => {
    const close = prepareCombo(closeCombo);
    const pause = prepareCombo(pauseCombo);
    const onKey = (e: KeyboardEvent) => {
      if (matchesPrepared(e, close)) {
        e.preventDefault();
        onClose();
      } else if (matchesPrepared(e, pause)) {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, closeCombo, pauseCombo]);

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-overlay backdrop-blur-sm">
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={syncOffsetFromScroll}
          className="no-scrollbar h-full overflow-y-auto overscroll-contain"
          style={{ maskImage: EDGE_FADE, WebkitMaskImage: EDGE_FADE }}
        >
          <div
            ref={contentRef}
            className="mx-auto max-w-[26ch] px-8 text-center leading-[1.7] font-medium tracking-wide whitespace-pre-wrap text-fg/90"
            style={{ fontSize, paddingTop: "46vh", paddingBottom: "54vh" }}
          >
            {text || copy.empty}
          </div>
        </div>
        <div
          className="pointer-events-none absolute inset-x-0 top-1/2 h-16 -translate-y-1/2 bg-accent/10"
          aria-hidden
        />
      </div>

      <div className="flex items-center justify-center gap-1.5 pb-3">
        <IconButton title={copy.restart} onClick={restart}>
          <RotateCcw />
        </IconButton>
        <IconButton
          title={playing ? copy.pause : copy.play}
          onClick={() => {
            setPlaying((p) => !p);
          }}
        >
          {playing ? <Pause /> : <Play />}
        </IconButton>

        <Stepper
          label={copy.speed}
          value={String(Math.round(speed))}
          onDec={() => {
            setSpeed((s) => clampSpeed(s - TELEPROMPTER_SPEED_STEP));
          }}
          onInc={() => {
            setSpeed((s) => clampSpeed(s + TELEPROMPTER_SPEED_STEP));
          }}
        />
        <Stepper
          label={copy.font}
          value={String(Math.round(fontSize))}
          onDec={() => {
            setFontSize((f) => clampFont(f - TELEPROMPTER_FONT_STEP));
          }}
          onInc={() => {
            setFontSize((f) => clampFont(f + TELEPROMPTER_FONT_STEP));
          }}
        />

        <IconButton title={copy.close} onClick={onClose}>
          <X />
        </IconButton>
      </div>
    </div>
  );
}

function Stepper({
  label,
  value,
  onDec,
  onInc,
}: {
  label: string;
  value: string;
  onDec: () => void;
  onInc: () => void;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-surface px-0.5 ring-1 ring-inset ring-line">
      <IconButton title={`${label} −`} onClick={onDec}>
        <Minus />
      </IconButton>
      <span className="w-14 text-center font-mono text-caption text-fg-subtle tabular-nums">
        {label} {value}
      </span>
      <IconButton title={`${label} +`} onClick={onInc}>
        <Plus />
      </IconButton>
    </div>
  );
}
