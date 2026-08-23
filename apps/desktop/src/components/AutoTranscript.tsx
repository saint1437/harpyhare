import { CornerDownLeft } from "lucide-react";
import { useEffect, useRef } from "react";
import { SectionLabel } from "@/components/SectionLabel";
import { Button } from "@/components/ui/button";
import type { AutoTurn } from "@/ipc/types";
import { speakerLabel } from "@/lib/auto-turns";
import { formatCombo } from "@/lib/hotkeys";
import { cn } from "@/lib/utils";

const TITLE = "Расшифровка";
const EMPTY_HINT = "Слушаю — реплики появятся здесь.";
const INSTANT_HINT = "Отвечаю на реплики собеседника сама.";
const ANSWER_LABEL = "Ответить";
const ANSWERED_HINT = "Всё услышанное уже ушло в чат.";

function pendingHint(count: number): string {
  return `Не отправлено реплик: ${String(count)}.`;
}

interface AutoTranscriptProps {
  turns: AutoTurn[];
  submittedThrough: number;
  pendingCount: number;
  instant: boolean;
  answerCombo: string;
  onAnswer: () => void;
}

export function AutoTranscript({
  turns,
  submittedThrough,
  pendingCount,
  instant,
  answerCombo,
  onAnswer,
}: AutoTranscriptProps) {
  const listRef = useRef<HTMLDivElement>(null);
  // Свежая реплика всегда внизу: панель низкая, и без доводки до конца новая
  // строка появлялась бы за краем — ровно та, ради которой на панель и смотрят.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [turns]);

  const hint = instant
    ? INSTANT_HINT
    : pendingCount > 0
      ? pendingHint(pendingCount)
      : ANSWERED_HINT;
  const answerTitle =
    answerCombo === "" ? ANSWER_LABEL : `${ANSWER_LABEL} (${formatCombo(answerCombo)})`;

  return (
    <section
      aria-label={TITLE}
      className="flex shrink-0 flex-col gap-1.5 rounded-lg bg-card px-2.5 py-2 shadow-raise ring-1 ring-border ring-inset"
    >
      <div className="flex items-center justify-between gap-2">
        <SectionLabel>{TITLE}</SectionLabel>
        <div className="flex items-center gap-2">
          <span className="text-hint text-muted-foreground">{hint}</span>
          {!instant && (
            <Button size="xs" disabled={pendingCount === 0} title={answerTitle} onClick={onAnswer}>
              <CornerDownLeft aria-hidden />
              {ANSWER_LABEL}
            </Button>
          )}
        </div>
      </div>
      <div ref={listRef} className="max-h-24 overflow-y-auto">
        {turns.length === 0 ? (
          <p className="text-caption text-muted-foreground">{EMPTY_HINT}</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {turns.map((turn) => (
              <li
                key={turn.seq}
                className={cn(
                  "text-caption",
                  turn.seq > submittedThrough ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <span className="text-muted-foreground">{speakerLabel(turn.speaker)}: </span>
                {turn.text}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
