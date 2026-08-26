import { useMemo, useState } from "react";
import { OnboardingGate } from "@/features/onboarding/OnboardingGate";
import type { SecretsApi } from "@/features/settings/contract";
import { useContextLibrary } from "@/hooks/useContextLibrary";
import { useDict } from "@/hooks/useDict";
import { useUpdater } from "@/hooks/useUpdater";
import { launchMainWindow } from "@/ipc/commands";
import type { Settings } from "@/ipc/types";
import { notifyError } from "@/lib/notifications";
import { applyTheme } from "@/lib/window-controls";
import {
  clearAccessCode,
  clearApiKey,
  redeemAccessCode,
  setApiKey,
  useSecretsBootstrap,
  useSecretsLoading,
  useSecretsStatus,
} from "@/state/secrets";
import {
  saveSettings,
  useSettings,
  useSettingsBootstrap,
  useSettingsLoading,
} from "@/state/settings";
import { LauncherPanel } from "./LauncherPanel";
import { useLauncherReadiness } from "./useLauncherReadiness";

/**
 * The launcher is an ordinary opaque window with no chat in it, so the theme is
 * the only visual setting it paints — the HUD's applier adds opacity and the
 * chat font size.
 */
function applyLauncherVisuals(settings: Settings): void {
  applyTheme(document.documentElement, settings.theme);
}

export function LauncherApp() {
  const dict = useDict();
  useSettingsBootstrap(applyLauncherVisuals);
  useSecretsBootstrap();
  const settings = useSettings();
  const secretsStatus = useSecretsStatus();
  // Оба флага читаются безусловно — `||` прямо в вызовах хуков закоротил бы
  // второй, и порядок хуков поехал бы на первом же завершении загрузки.
  // Ждать надо обоих: онбординг выбирается по `onboarding_done`, а готовность к
  // запуску — по признакам ключей, и показать одно без другого значит на
  // мгновение объявить настроенного пользователя ненастроенным.
  const settingsLoading = useSettingsLoading();
  const secretsLoading = useSecretsLoading();
  const loading = settingsLoading || secretsLoading;
  const updater = useUpdater();
  const contextLibrary = useContextLibrary();
  const readiness = useLauncherReadiness(settings, secretsStatus);
  const [launching, setLaunching] = useState(false);
  const [saving, setSaving] = useState(false);
  // A flag, not a text: the failure itself raises a notification, and the status
  // object only needs to know that it should offer a retry.
  const [saveFailed, setSaveFailed] = useState(false);
  // Re-entry from settings: the flag is already true, so the gate has to be
  // openable by hand as well as by the flag.
  const [replayOnboarding, setReplayOnboarding] = useState(false);

  // Одно место, где живут учётные данные и четыре способа их изменить: форму
  // кода и поля ключей рисуют три разные поверхности, и каждая получает этот
  // объект целиком вместо россыпи колбэков.
  const secrets = useMemo<SecretsApi>(
    () => ({
      status: secretsStatus,
      setKey: setApiKey,
      clearKey: clearApiKey,
      clearAccessCode,
      redeem: redeemAccessCode,
    }),
    [secretsStatus],
  );

  const persist = async (next: Settings): Promise<boolean> => {
    setSaving(true);
    try {
      const failure = await saveSettings(next);
      setSaveFailed(failure !== null);
      if (failure !== null) notifyError(dict.launcher.shell.saveFailedTitle, failure);
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
        setSaveFailed(true);
        notifyError(dict.launcher.shell.launchFailedTitle, String(e));
      }
      setLaunching(false);
    })();
  };

  // Скелет повторяет реальную раскладку: полноэкранное «Загрузка…» сменялось
  // совсем другой геометрией, и окно заметно перестраивалось на глазах.
  if (loading)
    return (
      <div className="flex h-screen flex-col gap-2.5 px-4 pt-0 pb-4 sm:px-5" aria-busy>
        <div className="h-9 shrink-0" />
        <div className="flex min-h-0 flex-1 gap-3 md:gap-4">
          <div className="w-10 shrink-0 rounded-md bg-surface min-[900px]:w-40" />
          <div className="min-h-0 flex-1 rounded-lg bg-surface ring-1 ring-inset ring-line" />
        </div>
        <span className="sr-only">{dict.launcher.shell.loading}</span>
      </div>
    );

  if (!settings.onboarding_done || replayOnboarding) {
    return (
      <OnboardingGate
        settings={settings}
        readiness={readiness}
        secrets={secrets}
        launching={launching}
        onPersist={handleSave}
        onLaunch={(next) => {
          handleLaunch({ ...next, onboarding_done: true });
        }}
        onFinish={(next) => {
          setReplayOnboarding(false);
          handleSave({ ...next, onboarding_done: true });
        }}
      />
    );
  }

  return (
    <LauncherPanel
      settings={settings}
      updater={updater}
      contextLibrary={contextLibrary}
      readiness={readiness}
      secrets={secrets}
      launching={launching}
      saving={saving}
      saveFailed={saveFailed}
      onSave={handleSave}
      onLaunch={handleLaunch}
      onReplayOnboarding={() => {
        setReplayOnboarding(true);
      }}
    />
  );
}
