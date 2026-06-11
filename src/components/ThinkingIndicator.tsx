import { useEffect, useState } from "react";

const elapsedSeconds = (startedAt: number) =>
  Math.max(0, Math.floor((Date.now() - startedAt) / 1000));

/** Индикатор фазы ожидания ответа («Думает… {N}с»). Секунды считаются от реального
 *  начала генерации (startedAt), а не от маунта — счётчик стабилен при переключении
 *  вкладок (индикатор может размонтироваться/смонтироваться). */
export function ThinkingIndicator({ startedAt }: { startedAt: number }) {
  const [seconds, setSeconds] = useState(() => elapsedSeconds(startedAt));

  useEffect(() => {
    setSeconds(elapsedSeconds(startedAt));
    const id = setInterval(() => {
      setSeconds(elapsedSeconds(startedAt));
    }, 1000);
    return () => {
      clearInterval(id);
    };
  }, [startedAt]);

  return (
    <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
      <span className="size-2 animate-pulse rounded-full bg-primary" aria-hidden />
      {/* Лейбл озвучивается один раз; тикающий счётчик скрыт от скринридера,
          чтобы polite-регион не зачитывал секунды каждую секунду. */}
      <span aria-live="polite">Думает…</span>
      <span aria-hidden> {seconds}с</span>
    </div>
  );
}
