import { useEffect, useState } from "react";

const SECOND_MS = 1000;

const elapsedSeconds = (startedAt: number) =>
  Math.max(0, Math.floor((Date.now() - startedAt) / SECOND_MS));

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

  return (
    <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
      <span className="size-2 animate-pulse rounded-full bg-primary" aria-hidden />
      <span aria-live="polite">Думает…</span>
      <span aria-hidden> {seconds}с</span>
    </div>
  );
}
