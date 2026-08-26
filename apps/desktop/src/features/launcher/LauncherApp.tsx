import { useCallback, useEffect, useRef, useState } from "react";
import { useContextLibrary } from "@/hooks/useContextLibrary";
import { useSettingsStore } from "@/hooks/useSettingsStore";
import { useUpdater } from "@/hooks/useUpdater";
import { launchMainWindow, redeemAccessCode } from "@/ipc/commands";
import type { Settings } from "@/ipc/types";
import { notifyError } from "@/lib/notifications";
import { applyTheme } from "@/lib/window-controls";
import { LauncherPanel } from "./LauncherPanel";
import { useLauncherReadiness, type LauncherReadiness } from "./useLauncherReadiness";
import { OnboardingFlow } from "../onboarding/OnboardingFlow";

const SAVE_FAILED_TITLE = "Не удалось сохранить настройки";
const LAUNCH_FAILED_TITLE = "Не удалось запустить окно";
const ONBOARDING_AUTOSAVE_DEBOUNCE_MS = 600;

/**
 * Onboarding needs a local draft for the same reason LauncherPanel has one:
 * the old `set` pushed every keystroke through set_settings, and the inputs
 * were controlled by the persisted value lagging a round trip behind — fast
 * typing into the key field lost characters, and every character rebuilt both
 * API clients.
 */
function OnboardingGate({
  settings,
  readiness,
  launching,
  onRedeem,
  onPersist,
  onLaunch,
  onFinish,
}: {
  settings: Settings;
  readiness: LauncherReadiness;
  launching: boolean;
  onRedeem: (code: string) => Promise<string | null>;
  onPersist: (next: Settings) => void;
  onLaunch: (next: Settings) => void;
  onFinish: (next: Settings) => void;
}) {
  const [draft, setDraft] = useState(settings);
  // Finishing cancels the pending autosave: a "save without onboarding_done
  // landed AFTER the final one" race would restart onboarding from scratch.
  const [closing, setClosing] = useState(false);
  // After redeeming a code the token arrives through reload() into settings —
  // the only thing onboarding adopts from outside.
  useEffect(() => {
    setDraft((d) =>
      d.access_token === settings.access_token ? d : { ...d, access_token: settings.access_token },
    );
  }, [settings.access_token]);
  const persistRef = useRef(onPersist);
  useEffect(() => {
    persistRef.current = onPersist;
  }, [onPersist]);
  const lastQueuedDraft = useRef(draft);
  useEffect(() => {
    if (launching || closing || draft === lastQueuedDraft.current) return;
    lastQueuedDraft.current = draft;
    const timer = setTimeout(() => {
      persistRef.current(draft);
    }, ONBOARDING_AUTOSAVE_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [draft, launching, closing]);
  return (
    <OnboardingFlow
      draft={draft}
      set={(key, value) => {
        setDraft((d) => ({ ...d, [key]: value }));
      }}
      readiness={readiness}
      launching={launching}
      onRedeem={onRedeem}
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
  // Не текст, а флаг: сам отказ показывает уведомление, а объекту статуса нужно
  // лишь знать, что предлагать повтор.
  const [saveFailed, setSaveFailed] = useState(false);
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
    setSaving(true);
    try {
      const failure = await save(next);
      setSaveFailed(failure !== null);
      if (failure !== null) notifyError(SAVE_FAILED_TITLE, failure);
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
        notifyError(LAUNCH_FAILED_TITLE, String(e));
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
        <span className="sr-only">Загрузка…</span>
      </div>
    );

  if (!settings.onboarding_done || replayOnboarding) {
    return (
      <OnboardingGate
        settings={settings}
        readiness={readiness}
        launching={launching}
        onRedeem={redeem}
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
      launching={launching}
      saving={saving}
      saveFailed={saveFailed}
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
