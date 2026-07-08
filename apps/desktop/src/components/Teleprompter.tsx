import { Minus, Pause, Play, Plus, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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
}

const EDGE_FADE =
  "linear-gradient(to bottom, transparent 0%, black 26%, black 74%, transparent 100%)";
const EMPTY_HINT = "Нет ответа для суфлёра";

export function Teleprompter({
  text,
  initialSpeed,
  initialFontSize,
  initialOffset,
  onPersist,
  onClose,
}: TeleprompterProps) {
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
  const valuesRef = useRef({ speed, fontSize });
  valuesRef.current = { speed, fontSize };
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
      onPersistRef.current(valuesRef.current.speed, valuesRef.current.fontSize, offsetRef.current);
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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-black/85 backdrop-blur-sm">
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={syncOffsetFromScroll}
          className="no-scrollbar h-full overflow-y-auto overscroll-contain"
          style={{ maskImage: EDGE_FADE, WebkitMaskImage: EDGE_FADE }}
        >
          <div
            className="mx-auto max-w-[26ch] px-8 text-center leading-[1.7] font-medium tracking-wide whitespace-pre-wrap text-white/90"
            style={{ fontSize, paddingTop: "46vh", paddingBottom: "54vh" }}
          >
            {text || EMPTY_HINT}
          </div>
        </div>
        <div
          className="pointer-events-none absolute inset-x-0 top-1/2 h-16 -translate-y-1/2 bg-primary/5"
          aria-hidden
        />
      </div>

      <div className="flex items-center justify-center gap-1.5 pb-4">
        <IconButton label="Сначала" onClick={restart}>
          <RotateCcw className="size-4" />
        </IconButton>
        <IconButton
          label={playing ? "Пауза (Пробел)" : "Воспроизвести (Пробел)"}
          onClick={() => {
            setPlaying((p) => !p);
          }}
        >
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </IconButton>

        <Stepper
          label="Скорость"
          value={String(Math.round(speed))}
          onDec={() => {
            setSpeed((s) => clampSpeed(s - TELEPROMPTER_SPEED_STEP));
          }}
          onInc={() => {
            setSpeed((s) => clampSpeed(s + TELEPROMPTER_SPEED_STEP));
          }}
        />
        <Stepper
          label="Шрифт"
          value={String(Math.round(fontSize))}
          onDec={() => {
            setFontSize((f) => clampFont(f - TELEPROMPTER_FONT_STEP));
          }}
          onInc={() => {
            setFontSize((f) => clampFont(f + TELEPROMPTER_FONT_STEP));
          }}
        />

        <IconButton label="Закрыть (Esc)" onClick={onClose}>
          <X className="size-4" />
        </IconButton>
      </div>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid size-8 place-items-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-ring"
    >
      {children}
    </button>
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
    <div className="flex items-center gap-1 rounded-full bg-white/5 px-1">
      <IconButton label={`${label} −`} onClick={onDec}>
        <Minus className="size-3.5" />
      </IconButton>
      <span className="w-14 text-center font-mono text-[11px] text-white/60">
        {label} {value}
      </span>
      <IconButton label={`${label} +`} onClick={onInc}>
        <Plus className="size-3.5" />
      </IconButton>
    </div>
  );
}
