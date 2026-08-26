import { useState } from "react";
import { LiveRegion } from "@/components/LiveRegion";
import { NotificationStack } from "@/components/NotificationStack";
import { Wordmark } from "@/components/Wordmark";
import { useConnectivity } from "@/hooks/useConnectivity";
import { useWindowDrag } from "@/hooks/useWindowDrag";
import type { Settings } from "@/ipc/types";
import { missingApiKeys } from "@/lib/api-keys";
import { TRAFFIC_LIGHTS_INSET_CLASS } from "@/lib/platform";
import { cn } from "@/lib/utils";
import { onboardingSteps, stepPosition, type OnboardingStepId } from "./onboarding-steps";
import type { SetSetting } from "../launcher/contract";
import type { LauncherReadiness } from "../launcher/useLauncherReadiness";
import { AccessStep } from "./steps/AccessStep";
import { AudioStep } from "./steps/AudioStep";
import { PrivacyStep } from "./steps/PrivacyStep";
import { ReadyStep } from "./steps/ReadyStep";

export interface OnboardingFlowProps {
  draft: Settings;
  set: SetSetting;
  readiness: LauncherReadiness;
  launching: boolean;
  onRedeem: (code: string) => Promise<string | null>;
  onLaunch: () => void;
  onFinish: () => void;
}

/**
 * Four steps on macOS, three on Windows — the difference falls out of the
 * permission registry rather than a branch here.
 *
 * Progress is the settings themselves, so quitting mid-flow and coming back lands
 * on the first unfinished step; there is no separate cursor to keep in sync.
 */
export function OnboardingFlow({
  draft,
  set,
  readiness,
  launching,
  onRedeem,
  onLaunch,
  onFinish,
}: OnboardingFlowProps) {
  const permissions = readiness.permissions;
  const steps = onboardingSteps();
  const accessDone = missingApiKeys(draft).length === 0;
  const [current, setCurrent] = useState<OnboardingStepId>(
    accessDone ? (steps[1] ?? "ready") : "access",
  );
  const onDragMouseDown = useWindowDrag();
  const connectivity = useConnectivity();

  const total = steps.length;
  const position = stepPosition(steps, current) + 1;
  const goTo = (id: OnboardingStepId) => {
    setCurrent(id);
  };
  const next = () => {
    const at = steps.indexOf(current);
    const following = steps[at + 1];
    if (following === undefined) onFinish();
    else goTo(following);
  };

  return (
    <div className="flex h-screen flex-col gap-2.5 px-4 pt-0 pb-4 sm:px-5">
      <LiveRegion message={`Первичная настройка, шаг ${String(position)} из ${String(total)}`} />
      <header
        onMouseDown={onDragMouseDown}
        className={cn("flex h-9 shrink-0 items-center", TRAFFIC_LIGHTS_INSET_CLASS)}
      >
        <Wordmark />
      </header>

      {/* Save, launch and redeem failures used to be invisible here:
          notifyError fired, but onboarding had no surface for it — the button
          just flipped back from «Запускаю…» with no explanation. */}
      <NotificationStack className="w-full max-w-96 self-end" />

      {current === "access" && (
        <AccessStep
          step={position}
          total={total}
          draft={draft}
          set={set}
          offline={connectivity.offline}
          onRedeem={onRedeem}
          onNext={next}
        />
      )}
      {current === "audio" && (
        <AudioStep
          step={position}
          total={total}
          permissions={permissions}
          onNext={next}
          onSkip={next}
        />
      )}
      {current === "privacy" && (
        <PrivacyStep step={position} total={total} draft={draft} set={set} onNext={next} />
      )}
      {current === "ready" && (
        <ReadyStep
          step={position}
          total={total}
          settings={draft}
          readiness={readiness}
          launching={launching}
          onLaunch={onLaunch}
          onFixAudio={() => {
            goTo("audio");
          }}
          onOpenLauncher={onFinish}
        />
      )}
    </div>
  );
}
