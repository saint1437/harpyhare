import { useEffect, useState } from "react";

/** Индикатор фазы ожидания ответа («Думает… {N}с»). Внутренний таймер тикает
 *  раз в секунду с момента маунта (≈ момент отправки запроса). */
export function ThinkingIndicator() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setSeconds((s) => s + 1);
    }, 1000);
    return () => {
      clearInterval(id);
    };
  }, []);

  return (
    <div className="flex items-center gap-2 text-[13px] text-muted-foreground" aria-live="polite">
      <span className="size-2 animate-pulse rounded-full bg-primary" aria-hidden />
      <span>Думает… {seconds}с</span>
    </div>
  );
}
