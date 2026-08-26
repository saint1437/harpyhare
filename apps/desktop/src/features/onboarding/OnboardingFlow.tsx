import { useState, type ReactNode } from "react";
import { LiveRegion } from "@/components/LiveRegion";
import { NotificationStack } from "@/components/NotificationStack";
import { Wordmark } from "@/components/Wordmark";
import type { SecretsApi, SetSetting } from "@/features/settings/contract";
import type { Readiness } from "@/features/settings/readiness";
import { useConnectivity } from "@/hooks/useConnectivity";
import { useDict } from "@/hooks/useDict";
import { useWindowDrag } from "@/hooks/useWindowDrag";
import { format } from "@/i18n";
import type { Settings } from "@/ipc/types";
import { TRAFFIC_LIGHTS_INSET_CLASS } from "@/lib/platform";
import { cn } from "@/lib/utils";
import { onboardingSteps, stepPosition, type OnboardingStepId } from "./onboarding-steps";
import { AccessStep } from "./steps/AccessStep";
import { AudioStep } from "./steps/AudioStep";
import { PrivacyStep } from "./steps/PrivacyStep";
import { ReadyStep } from "./steps/ReadyStep";

export interface OnboardingFlowProps {
  draft: Settings;
  set: SetSetting;
  readiness: Readiness;
  secrets: SecretsApi;
  launching: boolean;
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
  secrets,
  launching,
  onLaunch,
  onFinish,
}: OnboardingFlowProps) {
  const permissions = readiness.permissions;
  const steps = onboardingSteps();
  // Readiness already carries the answer, computed from the same flags — a
  // second `missingApiKeys` call here would be a copy of the launcher's rule.
  const accessDone = readiness.missingKeys.length === 0;
  const [current, setCurrent] = useState<OnboardingStepId>(
    accessDone ? (steps[1] ?? "ready") : "access",
  );
  const onDragMouseDown = useWindowDrag();
  const connectivity = useConnectivity();
  const shell = useDict().onboarding.shell;

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

  // Exhaustive over ONBOARDING_STEP_IDS, like the launcher's screens: adding a
  // step to the registry changes the step counter and the progress bar whether
  // or not anyone wrote its branch, so the compiler is the only thing that can
  // notice the missing one.
  const panels: Record<OnboardingStepId, ReactNode> = {
    access: (
      <AccessStep
        step={position}
        total={total}
        secrets={secrets}
        done={accessDone}
        offline={connectivity.offline}
        onNext={next}
      />
    ),
    audio: (
      <AudioStep
        step={position}
        total={total}
        permissions={permissions}
        onNext={next}
        onSkip={next}
      />
    ),
    privacy: <PrivacyStep step={position} total={total} draft={draft} set={set} onNext={next} />,
    ready: (
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
    ),
  };

  return (
    <div className="flex h-screen flex-col gap-2.5 px-4 pt-0 pb-4 sm:px-5">
      <LiveRegion
        message={format(shell.announcement, {
          step: String(position),
          total: String(total),
        })}
      />
      <header
        onMouseDown={onDragMouseDown}
        className={cn("flex h-9 shrink-0 items-center", TRAFFIC_LIGHTS_INSET_CLASS)}
      >
        <Wordmark />
      </header>

      {/* Save, launch and redeem failures used to be invisible here:
          notifyError fired, but onboarding had no surface for it — the launch
          button just flipped back out of its pending state with no explanation. */}
      <NotificationStack className="w-full max-w-96 self-end" />

      {panels[current]}
    </div>
  );
}
