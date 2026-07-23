import { useCallback, useState } from "react";
import { useContextLibrary } from "@/hooks/useContextLibrary";
import { useSettingsStore } from "@/hooks/useSettingsStore";
import { useUpdater } from "@/hooks/useUpdater";
import { launchMainWindow, openAudioPermissionSettings, redeemAccessCode } from "@/ipc/commands";
import type { Settings } from "@/ipc/types";
import { applyTheme } from "@/lib/window-controls";
import { LauncherPanel } from "./LauncherPanel";
import { useLauncherReadiness } from "./useLauncherReadiness";

function applyLauncherTheme(settings: Settings): void {
  applyTheme(document.documentElement, settings.theme);
}

export function LauncherApp() {
  const { settings, loading, save, reload } = useSettingsStore(applyLauncherTheme);
  const updater = useUpdater();
  const contextLibrary = useContextLibrary();
  const readiness = useLauncherReadiness(settings);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    const failure = await save(next);
    if (failure !== null) setError(failure);
    return failure === null;
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

  if (loading) return <div className="p-6 text-body text-muted-foreground">Загрузка…</div>;

  return (
    <LauncherPanel
      settings={settings}
      appVersion={updater.currentVersion}
      contextLibrary={contextLibrary}
      readiness={readiness}
      launching={launching}
      error={error}
      onOpenAudioSettings={() => void openAudioPermissionSettings()}
      onRedeem={redeem}
      onCheckUpdates={updater.checkNow}
      onSave={handleSave}
      onLaunch={handleLaunch}
    />
  );
}
