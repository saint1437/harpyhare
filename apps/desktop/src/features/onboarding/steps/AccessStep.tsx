import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { AccessCodeForm } from "@/components/AccessCodeForm";
import { Button } from "@/components/ui/button";
import { ApiKeysSection } from "@/features/settings/ApiKeysSection";
import type { SecretsApi } from "@/features/settings/contract";
import { useDict } from "@/hooks/useDict";
import { cn, SURFACE_CARD_CLASS } from "@/lib/utils";
import { OnboardingShell } from "../OnboardingShell";

/**
 * The first thing the product has ever said about itself, and the one input
 * without which nothing works. Everything else in the flow is skippable.
 */
export function AccessStep({
  step,
  total,
  secrets,
  done,
  offline,
  onNext,
}: {
  step: number;
  total: number;
  secrets: SecretsApi;
  /** The launcher decides this from the same flags — no second copy of the rule here. */
  done: boolean;
  offline: boolean;
  onNext: () => void;
}) {
  const dict = useDict();
  const copy = dict.onboarding.access;
  const [showKeys, setShowKeys] = useState(false);

  return (
    <OnboardingShell
      step={step}
      total={total}
      heading={copy.heading}
      primary={
        <Button disabled={!done} onClick={onNext}>
          {dict.common.actions.next}
        </Button>
      }
      secondary={
        offline ? <span className="text-caption text-danger">{copy.offline}</span> : undefined
      }
    >
      <p className="text-body text-fg-muted">{copy.intro}</p>

      {done ? (
        <div className={cn("p-3", SURFACE_CARD_CLASS)}>
          <p className="text-body text-fg">{copy.configured}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className={cn("flex flex-col gap-1.5 p-3", SURFACE_CARD_CLASS)}>
            <span className="text-body text-fg">{copy.codeLabel}</span>
            <p className="text-caption text-fg-subtle">{copy.codeHint}</p>
            <AccessCodeForm onRedeem={secrets.redeem} autoFocus />
          </div>

          {showKeys ? (
            <ApiKeysSection secrets={secrets} />
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2.5 self-start"
              onClick={() => {
                setShowKeys(true);
              }}
            >
              {copy.ownKeys}
              <ArrowRight className="size-3" aria-hidden />
            </Button>
          )}
        </div>
      )}
    </OnboardingShell>
  );
}
