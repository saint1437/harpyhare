import { useEffect, useState } from "react";
import { useDict } from "@/hooks/useDict";
import { format } from "@/i18n";
import type { HudCopy } from "@/i18n/hud-types";

const SECOND_MS = 1000;
const SECONDS_PER_MINUTE = 60;

const elapsedSeconds = (startedAt: number) =>
  Math.max(0, Math.floor((Date.now() - startedAt) / SECOND_MS));

const formatElapsed = (seconds: number, copy: HudCopy["thinking"]) => {
  if (seconds < SECONDS_PER_MINUTE) return format(copy.seconds, { seconds: String(seconds) });
  return format(copy.minutes, {
    minutes: String(Math.floor(seconds / SECONDS_PER_MINUTE)),
    seconds: String(seconds % SECONDS_PER_MINUTE),
  });
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
  const copy = useDict().hud.thinking;
  const seconds = useElapsedSeconds(startedAt);

  return (
    <div className="flex animate-in items-baseline gap-2 duration-200 fade-in motion-reduce:animate-none">
      <span className="thinking-shimmer text-body font-medium" aria-live="polite">
        {copy.label}
      </span>
      <span className="font-mono text-caption text-fg-subtle/60 tabular-nums" aria-hidden>
        {formatElapsed(seconds, copy)}
      </span>
    </div>
  );
}
