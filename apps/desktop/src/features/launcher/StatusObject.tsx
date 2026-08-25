import { ChevronRight } from "lucide-react";
import { StateBadge, type StateTone } from "@/components/StateBadge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LauncherBlocker, LauncherReadiness } from "./useLauncherReadiness";

export type SaveState = "idle" | "saving" | "saved" | "failed";

interface Status {
  tone: StateTone;
  line: string;
  detail?: string;
}

/**
 * The launcher's answer to all three questions at once: is it listening, what is
 * it doing, what can I do next.
 *
 * In the launcher the honest answer to the first is normally "no" — this window
 * captures nothing. The exception is «Проверка звука», which opens a real tap;
 * that is the one moment the object goes `listening`, and it is deliberately
 * where the user learns what the colour means, before it matters in a call.
 *
 * Saving has its OWN slot below. It used to occupy this line and outrank the
 * blocker, so the acknowledgement was a 600ms flash that also hid the thing the
 * user had just been told to fix.
 */
function readinessStatus(
  readiness: LauncherReadiness,
  launching: boolean,
  audioCheckRunning: boolean,
): Status {
  if (launching) return { tone: "neutral", line: "Запускаю окно" };
  if (audioCheckRunning) return { tone: "listening", line: "Слушаю", detail: "проверка звука" };
  if (readiness.checking) return { tone: "neutral", line: "Проверяю доступы" };
  const blocker = readiness.blockers[0];
  if (blocker) return { tone: "danger", line: blocker.label, detail: "нажмите, чтобы исправить" };
  return { tone: "success", line: "Всё готово", detail: "к запуску" };
}

const SAVE_STATUS: Record<Exclude<SaveState, "idle">, Status> = {
  saving: { tone: "neutral", line: "Сохраняю" },
  saved: { tone: "success", line: "Сохранено" },
  failed: { tone: "danger", line: "Не удалось сохранить", detail: "повторить" },
};

function StatusLine({
  status,
  className,
  title,
}: {
  status: Status;
  className?: string;
  title?: string;
}) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)} title={title}>
      <StateBadge tone={status.tone} label={status.line} />
      {status.detail !== undefined && (
        <span className="truncate text-caption text-fg-subtle">{status.detail}</span>
      )}
    </span>
  );
}

export function StatusObject({
  readiness,
  launching,
  audioCheckRunning,
  saveState,
  onGoToBlocker,
  onRetrySave,
}: {
  readiness: LauncherReadiness;
  launching: boolean;
  audioCheckRunning: boolean;
  saveState: SaveState;
  onGoToBlocker: (blocker: LauncherBlocker) => void;
  onRetrySave: () => void;
}) {
  const status = readinessStatus(readiness, launching, audioCheckRunning);
  const blocker = readiness.blockers[0];
  const actionable = blocker !== undefined && !launching && !readiness.checking;

  return (
    <div className="flex min-w-0 flex-col items-end">
      {actionable ? (
        <Button
          variant="ghost"
          size="compact"
          className="min-w-0 gap-2"
          title={status.line}
          onClick={() => {
            onGoToBlocker(blocker);
          }}
        >
          <StatusLine status={status} />
          <ChevronRight className="size-3 shrink-0 text-fg-subtle" aria-hidden />
        </Button>
      ) : (
        <StatusLine status={status} className="h-6.5 px-2" title={status.line} />
      )}

      {saveState !== "idle" &&
        (saveState === "failed" ? (
          <Button variant="ghost" size="compact" className="min-w-0" onClick={onRetrySave}>
            <StatusLine status={SAVE_STATUS.failed} />
          </Button>
        ) : (
          <StatusLine status={SAVE_STATUS[saveState]} className="px-2" />
        ))}
    </div>
  );
}
