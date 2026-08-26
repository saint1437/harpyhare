import { CornerDownLeft } from "lucide-react";
import { useEffect, useRef } from "react";
import { SectionLabel } from "@/components/SectionLabel";
import { Button } from "@/components/ui/button";
import { useDict } from "@/hooks/useDict";
import { format } from "@/i18n";
import type { AutoTurn } from "@/ipc/types";
import { withComboHint } from "@/lib/hotkeys";
import { cn, SURFACE_CARD_CLASS } from "@/lib/utils";

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
  const dict = useDict();
  const copy = dict.hud.autoTranscript;
  const listRef = useRef<HTMLDivElement>(null);
  // Свежая реплика всегда внизу: панель низкая, и без доводки до конца новая
  // строка появлялась бы за краем — ровно та, ради которой на панель и смотрят.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [turns]);

  const hint = instant
    ? copy.instant
    : pendingCount > 0
      ? format(copy.pending, { count: String(pendingCount) })
      : copy.answered;
  const answerTitle = withComboHint(copy.answer, answerCombo);

  return (
    <section
      aria-label={copy.title}
      className={cn("flex shrink-0 flex-col gap-1.5 px-2.5 py-2", SURFACE_CARD_CLASS)}
    >
      <div className="flex items-center justify-between gap-2">
        <SectionLabel>{copy.title}</SectionLabel>
        <div className="flex items-center gap-2">
          <span className="text-hint text-fg-subtle">{hint}</span>
          {!instant && (
            <Button size="xs" disabled={pendingCount === 0} title={answerTitle} onClick={onAnswer}>
              <CornerDownLeft aria-hidden />
              {copy.answer}
            </Button>
          )}
        </div>
      </div>
      <div ref={listRef} className="max-h-24 overflow-y-auto">
        {turns.length === 0 ? (
          <p className="text-caption text-fg-subtle">{copy.empty}</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {turns.map((turn) => (
              <li
                key={turn.seq}
                className={cn(
                  "text-caption",
                  turn.seq > submittedThrough ? "text-fg" : "text-fg-subtle",
                )}
              >
                {/* On screen the speaker is `common.speakers`, never the label
                    `lib/auto-turns` renders into the prompt: that one stays
                    Russian because the presets address the model in it. */}
                <span className="text-fg-subtle">{dict.common.speakers[turn.speaker]}: </span>
                {turn.text}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
