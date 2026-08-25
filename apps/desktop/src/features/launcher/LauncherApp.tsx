import { useCallback, useState } from "react";
import { useContextLibrary } from "@/hooks/useContextLibrary";
import { useSettingsStore } from "@/hooks/useSettingsStore";
import { useUpdater } from "@/hooks/useUpdater";
import { launchMainWindow, redeemAccessCode } from "@/ipc/commands";
import type { Settings } from "@/ipc/types";
import { applyTheme } from "@/lib/window-controls";
import { LauncherPanel } from "./LauncherPanel";
import { useLauncherReadiness } from "./useLauncherReadiness";
import { OnboardingFlow } from "../onboarding/OnboardingFlow";

function applyLauncherTheme(settings: Settings): void {
  applyTheme(document.documentElement, settings.theme);
}

export function LauncherApp() {
  const { settings, loading, save, reload } = useSettingsStore(applyLauncherTheme);
  const updater = useUpdater();
  const contextLibrary = useContextLibrary();
  const readiness = useLauncherReadiness(settings);
  const [launching, setLaunching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Re-entry from settings: the flag is already true, so the gate has to be
  // openable by hand as well as by the flag.
  const [replayOnboarding, setReplayOnboarding] = useState(false);

  const redeem = useCallback(
    async (code: string): Promise<string | null> => {
      const failure = await redeemAccessCode(code);
      if (failure === null) await reload();
      return failure;
    },
    [reload],
  );

  const persist = async (next: Settings): Promise<boolean> => {
    setError(null);
    setSaving(true);
    try {
      const failure = await save(next);
      if (failure !== null) setError(failure);
      return failure === null;
    } finally {
      setSaving(false);
    }
  };

  const handleSave = (next: Settings) => {
    void persist(next);
  };

  const handleLaunch = (next: Settings) => {
    if (!readiness.ready) return;
    setLaunching(true);
    void (async () => {
      try {
        if (await persist(next)) {
          await launchMainWindow();
          return;
        }
      } catch (e) {
        setError(String(e));
      }
      setLaunching(false);
    })();
  };

  if (loading)
    return (
      <div className="grid h-screen place-items-center text-body text-fg-subtle">Загрузка…</div>
    );

  if (!settings.onboarding_done || replayOnboarding) {
    const finish = () => {
      setReplayOnboarding(false);
      handleSave({ ...settings, onboarding_done: true });
    };
    return (
      <OnboardingFlow
        draft={settings}
        set={(key, value) => {
          handleSave({ ...settings, [key]: value });
        }}
        permissions={readiness.permissions}
        launching={launching}
        onRedeem={redeem}
        onLaunch={() => {
          handleLaunch({ ...settings, onboarding_done: true });
        }}
        onFinish={finish}
      />
    );
  }

  return (
    <LauncherPanel
      settings={settings}
      updater={updater}
      contextLibrary={contextLibrary}
      readiness={readiness}
      launching={launching}
      saving={saving}
      error={error}
      onRedeem={redeem}
      onCheckUpdates={updater.checkNow}
      onSave={handleSave}
      onLaunch={handleLaunch}
      onReplayOnboarding={() => {
        setReplayOnboarding(true);
      }}
    />
  );
}
