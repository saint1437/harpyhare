import { StateBadge } from "@/components/StateBadge";
import { Button } from "@/components/ui/button";
import { permissionRowCopy, PERMISSION_STATE_TONE } from "@/features/settings/permission-rows";
import { RequestPermissionButton } from "@/features/settings/RequestPermissionButton";
import { useDict } from "@/hooks/useDict";
import type { PermissionsApi } from "@/hooks/usePermissions";
import { cn, SURFACE_CARD_CLASS } from "@/lib/utils";
import { OnboardingShell } from "../OnboardingShell";

const AUDIO_KIND = "audio";

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
  const dict = useDict();
  const copy = dict.onboarding.audio;
  const state = permissions.status.audio;
  const asking = permissions.awaiting === AUDIO_KIND;
  const granted = state === "granted";

  return (
    <OnboardingShell
      step={step}
      total={total}
      heading={copy.heading}
      primary={<Button onClick={onNext}>{dict.common.actions.next}</Button>}
      secondary={
        granted ? undefined : (
          <Button variant="ghost" size="sm" onClick={onSkip}>
            {copy.skip}
          </Button>
        )
      }
    >
      <p className="text-body text-fg-muted">{copy.why}</p>

      <div className={cn("flex flex-col gap-2.5 p-3", SURFACE_CARD_CLASS)}>
        <div className="grid min-h-9 grid-cols-[minmax(0,1fr)_14rem] items-center gap-x-4">
          <span className="min-w-0 text-body text-fg">
            {permissionRowCopy(AUDIO_KIND, dict).title}
          </span>
          <div className="flex justify-end">
            {asking ? (
              <StateBadge tone="neutral" label={copy.asking} />
            ) : (
              <StateBadge tone={PERMISSION_STATE_TONE[state]} label={copy.states[state]} />
            )}
          </div>
        </div>
        {!granted && (
          <div className="flex flex-wrap items-center gap-1.5">
            <RequestPermissionButton
              permissions={permissions}
              kind={AUDIO_KIND}
              label={copy.grant}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                permissions.openSettings(AUDIO_KIND);
              }}
            >
              {copy.openSystemSettings}
            </Button>
          </div>
        )}
        {state === "denied" && !asking && (
          <p className="text-caption text-fg-subtle">{copy.deniedNote}</p>
        )}
      </div>
    </OnboardingShell>
  );
}
