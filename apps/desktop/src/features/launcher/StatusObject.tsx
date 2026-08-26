import { ChevronRight } from "lucide-react";
import { StateBadge, type StateTone } from "@/components/StateBadge";
import { Button } from "@/components/ui/button";
import { useDict } from "@/hooks/useDict";
import type { Dictionary } from "@/i18n/types";
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
  dict: Dictionary,
): Status {
  const copy = dict.launcher.status;
  if (launching) return { tone: "neutral", line: copy.launching };
  if (audioCheckRunning) {
    return { tone: "listening", line: copy.audioCheck.line, detail: copy.audioCheck.detail };
  }
  if (readiness.checking) return { tone: "neutral", line: copy.checking };
  const blocker = readiness.blockers[0];
  if (blocker) return { tone: "danger", line: blocker.label, detail: copy.blockerDetail };
  return { tone: "success", line: copy.ready.line, detail: copy.ready.detail };
}

function saveStatus(state: Exclude<SaveState, "idle">, dict: Dictionary): Status {
  const copy = dict.launcher.status;
  if (state === "saving") return { tone: "neutral", line: copy.saving };
  if (state === "saved") return { tone: "success", line: copy.saved };
  return { tone: "danger", line: copy.saveFailed.line, detail: copy.saveFailed.detail };
}

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
  const dict = useDict();
  const status = readinessStatus(readiness, launching, audioCheckRunning, dict);
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
            <StatusLine status={saveStatus("failed", dict)} />
          </Button>
        ) : (
          <StatusLine status={saveStatus(saveState, dict)} className="px-2" />
        ))}
    </div>
  );
}
