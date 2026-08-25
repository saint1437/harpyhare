import { StateBadge, type StateTone } from "@/components/StateBadge";
import { Button } from "@/components/ui/button";
import type { PermissionsApi } from "@/hooks/usePermissions";
import type { PermissionState } from "@/ipc/bindings";
import { PERMISSION_ROWS } from "../../launcher/permission-rows";
import { OnboardingShell } from "../OnboardingShell";

const WHY =
  "Без этого приложение не услышит собеседника — оно берёт звук, который macOS отдаёт в наушники или колонки. Микрофон при этом не включается.";
const DENIED_NOTE =
  "Пока доступа нет, приложение не сможет расслышать собеседника. Выдать его можно в любой момент на экране «Доступы».";

const AUDIO_ROW = PERMISSION_ROWS.find((row) => row.kind === "audio");

const STATE_LABEL: Record<PermissionState, string> = {
  granted: "выдан",
  denied: "отказано",
  unknown: "не выдан",
};
const STATE_TONE: Record<PermissionState, StateTone> = {
  granted: "success",
  denied: "danger",
  unknown: "warning",
};

/**
 * The row's geometry must not depend on its state: the TCC prompt is async, so
 * the status changes under the cursor, and any size that moved with it would pull
 * the button out from under a finger mid-press.
 */
export function AudioStep({
  step,
  total,
  permissions,
  onNext,
  onSkip,
}: {
  step: number;
  total: number;
  permissions: PermissionsApi;
  onNext: () => void;
  onSkip: () => void;
}) {
  const state = permissions.status.audio;
  const asking = permissions.awaiting === "audio";
  const granted = state === "granted";

  return (
    <OnboardingShell
      step={step}
      total={total}
      heading="Разрешите записывать системный звук"
      primary={<Button onClick={onNext}>Дальше</Button>}
      secondary={
        granted ? undefined : (
          <Button variant="ghost" size="sm" onClick={onSkip}>
            Пропустить — настроить позже
          </Button>
        )
      }
    >
      <p className="text-body text-fg-muted">{WHY}</p>

      <div className="flex flex-col gap-2.5 rounded-lg bg-surface p-3 shadow-raise ring-1 ring-inset ring-line">
        <div className="grid min-h-9 grid-cols-[minmax(0,1fr)_14rem] items-center gap-x-4">
          <span className="min-w-0 text-body text-fg">{AUDIO_ROW?.title}</span>
          <div className="flex justify-end">
            {asking ? (
              <StateBadge tone="neutral" label="система спрашивает…" />
            ) : (
              <StateBadge tone={STATE_TONE[state]} label={STATE_LABEL[state]} />
            )}
          </div>
        </div>
        {!granted && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              className="min-w-18"
              disabled={permissions.pending !== null}
              onClick={() => void permissions.request("audio")}
            >
              {permissions.pending === "audio" ? "Запрашиваю…" : "Разрешить"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                permissions.openSettings("audio");
              }}
            >
              Открыть настройки macOS
            </Button>
          </div>
        )}
        {state === "denied" && !asking && (
          <p className="text-caption text-fg-subtle">{DENIED_NOTE}</p>
        )}
      </div>
    </OnboardingShell>
  );
}
