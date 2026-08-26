import { useState } from "react";
import type { SecretsApi } from "@/features/settings/contract";
import type { Readiness } from "@/features/settings/readiness";
import { useAutosavedDraft } from "@/features/settings/useAutosavedDraft";
import type { Settings } from "@/ipc/types";
import { OnboardingFlow } from "./OnboardingFlow";

/**
 * Onboarding needs a local draft for the same reason LauncherPanel has one:
 * the old `set` pushed every keystroke through set_settings, and the inputs
 * were controlled by the persisted value lagging a round trip behind — fast
 * typing into the key field lost characters, and every character rebuilt both
 * API clients.
 */
export function OnboardingGate({
  settings,
  readiness,
  secrets,
  launching,
  onPersist,
  onLaunch,
  onFinish,
}: {
  settings: Settings;
  readiness: Readiness;
  secrets: SecretsApi;
  launching: boolean;
  onPersist: (next: Settings) => void;
  onLaunch: (next: Settings) => void;
  onFinish: (next: Settings) => void;
}) {
  const [draft, setDraft] = useState(settings);
  // Finishing cancels the pending autosave: a "save without onboarding_done
  // landed AFTER the final one" race would restart onboarding from scratch.
  const [closing, setClosing] = useState(false);
  // There is nothing left to adopt from outside: the access token used to be a
  // `Settings` field that a redeem wrote behind the flow's back, and merging it
  // into the draft was the only reason this component watched `settings`. The
  // secrets are their own store now and the flow reads them live.

  useAutosavedDraft(draft, launching || closing, onPersist);

  return (
    <OnboardingFlow
      draft={draft}
      set={(key, value) => {
        setDraft((d) => ({ ...d, [key]: value }));
      }}
      readiness={readiness}
      secrets={secrets}
      launching={launching}
      onLaunch={() => {
        onLaunch(draft);
      }}
      onFinish={() => {
        setClosing(true);
        onFinish(draft);
      }}
    />
  );
}
