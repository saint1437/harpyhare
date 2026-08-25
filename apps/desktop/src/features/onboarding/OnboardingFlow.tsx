import { useState } from "react";
import { LiveRegion } from "@/components/LiveRegion";
import { Wordmark } from "@/components/Wordmark";
import { useConnectivity } from "@/hooks/useConnectivity";
import type { PermissionsApi } from "@/hooks/usePermissions";
import { useWindowDrag } from "@/hooks/useWindowDrag";
import type { Settings } from "@/ipc/types";
import { missingApiKeys } from "@/lib/api-keys";
import { PLATFORM } from "@/lib/platform";
import { cn } from "@/lib/utils";
import { onboardingSteps, stepPosition, type OnboardingStepId } from "./onboarding-steps";
import type { SetSetting } from "../launcher/contract";
import { AccessStep } from "./steps/AccessStep";
import { AudioStep } from "./steps/AudioStep";
import { PrivacyStep } from "./steps/PrivacyStep";
import { ReadyStep } from "./steps/ReadyStep";

const MACOS_TRAFFIC_LIGHTS_CLASS = PLATFORM === "macos" ? "pl-16" : "";

export interface OnboardingFlowProps {
  draft: Settings;
  set: SetSetting;
  permissions: PermissionsApi;
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
  permissions,
  launching,
  onRedeem,
  onLaunch,
  onFinish,
}: OnboardingFlowProps) {
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
        className={cn("flex h-9 shrink-0 items-center", MACOS_TRAFFIC_LIGHTS_CLASS)}
      >
        <Wordmark />
      </header>

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
          audioReady={permissions.audioOk}
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
