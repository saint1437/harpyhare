import { useEffect, useState } from "react";
import { ORB_SIZE_INLINE, ORB_THEME, ThinkingOrb } from "@/components/ui/thinking-orbs";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

const SECOND_MS = 1000;
const SECONDS_PER_MINUTE = 60;

const elapsedSeconds = (startedAt: number) =>
  Math.max(0, Math.floor((Date.now() - startedAt) / SECOND_MS));

const formatElapsed = (seconds: number) => {
  if (seconds < SECONDS_PER_MINUTE) return `${seconds}с`;
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
  return `${minutes}м ${seconds % SECONDS_PER_MINUTE}с`;
};

function useElapsedSeconds(startedAt: number) {
  const [seconds, setSeconds] = useState(() => elapsedSeconds(startedAt));

  useEffect(() => {
    setSeconds(elapsedSeconds(startedAt));
    const id = setInterval(() => {
      setSeconds(elapsedSeconds(startedAt));
    }, SECOND_MS);
    return () => {
      clearInterval(id);
    };
  }, [startedAt]);

  return seconds;
}

export function ThinkingIndicator({ startedAt }: { startedAt: number }) {
  const seconds = useElapsedSeconds(startedAt);
  const reducedMotion = usePrefersReducedMotion();

  return (
    <div className="flex animate-in items-baseline gap-2 duration-200 fade-in motion-reduce:animate-none">
      {!reducedMotion && (
        <span className="self-center" aria-hidden>
          <ThinkingOrb state="solving" size={ORB_SIZE_INLINE} theme={ORB_THEME} />
        </span>
      )}
      <span className="thinking-shimmer text-body font-medium" aria-live="polite">
        Думает…
      </span>
      <span className="font-mono text-caption text-muted-foreground/60 tabular-nums" aria-hidden>
        {formatElapsed(seconds)}
      </span>
    </div>
  );
}
