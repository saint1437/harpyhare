import { Minus, Pause, Play, Plus, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
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
  const offsetRef = useRef(initialOffset);
  const lastTsRef = useRef(0);
  const rafRef = useRef(0);
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const fontSizeRef = useRef(fontSize);
  fontSizeRef.current = fontSize;
  const onPersistRef = useRef(onPersist);
  onPersistRef.current = onPersist;

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = offsetRef.current;
  }, []);

  useEffect(() => {
    const tick = (ts: number) => {
      const el = scrollRef.current;
      if (el) {
        const elapsed = lastTsRef.current === 0 ? 0 : ts - lastTsRef.current;
        lastTsRef.current = ts;
        if (playingRef.current) {
          const maxOffset = el.scrollHeight - el.clientHeight;
          offsetRef.current = advanceOffset(
            offsetRef.current,
            speedRef.current,
            elapsed,
            maxOffset,
          );
          el.scrollTop = offsetRef.current;
          if (offsetRef.current >= maxOffset) setPlaying(false);
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

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
