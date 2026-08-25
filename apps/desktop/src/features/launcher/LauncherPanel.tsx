import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { LiveRegion } from "@/components/LiveRegion";
import { useAudioCheck } from "@/hooks/useAudioCheck";
import { useConnectivity } from "@/hooks/useConnectivity";
import { useOfficialPresets } from "@/hooks/useOfficialPresets";
import type { Settings } from "@/ipc/types";
import { effectiveCombo } from "@/lib/hotkeys";
import { isPresetFilled, mergePresets } from "@/lib/presets";
import { isQuickActionFilled } from "@/lib/quick-actions";
import { ContextLibraryPanel } from "./ContextLibraryPanel";
import type { LauncherDestination, LauncherPanelProps, SetSetting } from "./contract";
import { LaunchBar } from "./LaunchBar";
import { LauncherSearch } from "./LauncherSearch";
import { DEFAULT_SCREEN, type ScreenId } from "./screens";
import { PermissionsScreen } from "./screens/PermissionsScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { StartScreen } from "./screens/StartScreen";
import { UpdatesScreen, type CheckState } from "./screens/UpdatesScreen";
import { ScreenShell } from "./ScreenShell";
import { PresetsSection, type PresetsUpdate } from "./sections/PresetsSection";
import { DEFAULT_SETTINGS_TAB, type SettingsTabId } from "./settings-tabs";
import { Sidebar, type SidebarNotice } from "./Sidebar";
import type { SaveState } from "./StatusObject";
import { panelId, panelProps } from "./useRovingTabs";

const RECORD_ACTION = "record";
const RISE_STEP_MS = 50;
const AUTOSAVE_DEBOUNCE_MS = 600;

function riseDelay(order: number): CSSProperties {
  return { animationDelay: `${String(order * RISE_STEP_MS)}ms` };
}

function normalizeDraft(draft: Settings): Settings {
  return {
    ...draft,
    prompt_presets: draft.prompt_presets.filter(isPresetFilled),
    quick_actions: draft.quick_actions.filter(isQuickActionFilled),
  };
}

export function LauncherPanel({
  settings,
  contextLibrary,
  readiness,
  updater,
  launching,
  saving,
  error,
  onRedeem,
  onCheckUpdates,
  onSave,
  onLaunch,
  onReplayOnboarding,
}: LauncherPanelProps) {
  const [draft, setDraft] = useState<Settings>(settings);
  const [checkState, setCheckState] = useState<CheckState>("idle");
  const [screen, setScreen] = useState<ScreenId>(DEFAULT_SCREEN);
  const [settingsTab, setSettingsTab] = useState<SettingsTabId>(DEFAULT_SETTINGS_TAB);

  const official = useOfficialPresets();
  const audioCheck = useAudioCheck();
  // Что именно ушло в `set_settings` последним — и для адоптации клампа, и для
  // повтора неудавшегося сохранения.
  const lastSavedRef = useRef<Settings | null>(null);
  // Лаунчер до сих пор не знал про сеть вовсе: погашение кода без интернета
  // печатало сырую английскую строку reqwest в русский интерфейс.
  const connectivity = useConnectivity();

  const saveState: SaveState =
    error !== null
      ? "failed"
      : saving
        ? "saving"
        : lastSavedRef.current === null
          ? "idle"
          : "saved";

  const retrySave = () => {
    const pending = lastSavedRef.current;
    if (pending !== null) onSave(pending);
  };

  const searchSources = useMemo(
    () => ({
      presets: mergePresets(official, draft.prompt_presets).map((p) => ({
        id: p.id,
        name: p.name,
      })),
      quickActions: draft.quick_actions.map((a) => ({ id: a.id, title: a.title })),
      contextDocs: contextLibrary.library.docs.map((d) => ({ id: d.id, name: d.name })),
    }),
    [official, draft.prompt_presets, draft.quick_actions, contextLibrary.library.docs],
  );

  const sidebarNotices = useMemo<SidebarNotice[]>(
    () => [
      ...readiness.blockers.map((b): SidebarNotice => ({
        screen: b.screen,
        label: b.label,
        kind: "blocker",
      })),
      ...(updater.info === null
        ? []
        : [
            {
              screen: "updates",
              label: `Доступна версия ${updater.info.version}`,
              kind: "info",
            } as const satisfies SidebarNotice,
          ]),
    ],
    [readiness.blockers, updater.info],
  );

  const goTo = ({ screen: target, tab }: LauncherDestination) => {
    setScreen(target);
    if (tab !== undefined) setSettingsTab(tab);
  };

  // Rust возвращает КЛАМПНУТЫЕ настройки, и адоптировать их обязательно: иначе
  // после того как `Settings::clamp` снял конфликтующий хоткей или обрезал
  // список быстрых действий, лаунчер продолжал показывать то, чего на диске уже
  // нет. Свой же черновик не перетираем — только то, что бэкенд изменил сам.
  useEffect(() => {
    setDraft((d) => {
      const sent = lastSavedRef.current;
      if (sent === null) {
        return d.access_token === settings.access_token
          ? d
          : { ...d, access_token: settings.access_token };
      }
      const adopted = { ...d };
      let changed = false;
      for (const key of Object.keys(settings) as (keyof Settings)[]) {
        if (sent[key] !== settings[key] && d[key] === sent[key]) {
          (adopted as Record<string, unknown>)[key] = settings[key];
          changed = true;
        }
      }
      return changed ? adopted : d;
    });
  }, [settings]);

  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  const lastQueuedDraft = useRef(draft);
  useEffect(() => {
    if (launching || draft === lastQueuedDraft.current) return;
    lastQueuedDraft.current = draft;
    const timer = setTimeout(() => {
      const next = normalizeDraft(draft);
      lastSavedRef.current = next;
      onSaveRef.current(next);
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [draft, launching]);

  const checkUpdates = () => {
    setCheckState("checking");
    onCheckUpdates()
      .then((found) => {
        setCheckState(found ? "idle" : "latest");
      })
      .catch((e: unknown) => {
        setCheckState({ failure: String(e) });
      });
  };

  const set: SetSetting = (key, value) => {
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const changePresets = (update: PresetsUpdate) => {
    setDraft((d) => ({ ...d, prompt_presets: update(d.prompt_presets) }));
  };

  return (
    <div className="flex h-screen flex-col gap-2.5 px-4 pt-0 pb-4 sm:px-5">
      <LiveRegion message={error ?? ""} />
      <div className="launcher-rise relative z-30" style={riseDelay(0)}>
        <LaunchBar
          readiness={readiness}
          launching={launching}
          saveState={saveState}
          audioCheckRunning={audioCheck.running !== null}
          onRetrySave={retrySave}
          search={
            <LauncherSearch
              sources={searchSources}
              onNavigate={(hit) => {
                goTo({ screen: hit.screen, tab: hit.tab ?? undefined });
              }}
            />
          }
          onGoToBlocker={(blocker) => {
            goTo({ screen: blocker.screen, tab: blocker.tab });
          }}
          onLaunch={() => {
            onLaunch(normalizeDraft(draft));
          }}
        />
      </div>

      {connectivity.offline && (
        <div className="flex items-center gap-2.5 rounded-lg bg-surface px-3 py-2 ring-1 ring-inset ring-line">
          <span className="size-1.5 shrink-0 rounded-full bg-warning" aria-hidden />
          <span className="min-w-0 text-body text-fg-muted">
            Нет соединения — код доступа и обновления сейчас не проверить.
          </span>
        </div>
      )}
      {error !== null && (
        <div className="flex items-center gap-2.5 rounded-lg bg-danger/10 px-3 py-2 ring-1 ring-danger ring-inset">
          <span className="size-1.5 shrink-0 rounded-full bg-danger" aria-hidden />
          <span className="min-w-0 text-body text-danger">{error}</span>
        </div>
      )}

      <a
        href={`#${panelId(screen)}`}
        className="sr-only rounded-md bg-elevated px-3 py-1.5 text-body text-fg shadow-pop focus:not-sr-only focus:absolute focus:top-10 focus:left-5 focus:z-40"
      >
        К содержимому экрана
      </a>

      <div className="flex min-h-0 min-w-0 flex-1 gap-3 md:gap-4">
        <div className="launcher-rise flex min-h-0" style={riseDelay(1)}>
          <Sidebar
            active={screen}
            notices={sidebarNotices}
            onSelect={(target) => {
              goTo({ screen: target });
            }}
          />
        </div>
        <div className="launcher-rise flex min-h-0 min-w-0 flex-1" style={riseDelay(2)}>
          <div
            key={screen}
            {...panelProps(screen)}
            className="flex min-h-0 min-w-0 flex-1 animate-in duration-150 fade-in-0 outline-none slide-in-from-bottom-1 motion-reduce:animate-none"
          >
            {screen === "start" && (
              <StartScreen
                readiness={readiness}
                launching={launching}
                audioCheck={audioCheck}
                recordCombo={effectiveCombo(draft.hotkeys, RECORD_ACTION)}
                onRedeem={onRedeem}
                onNavigate={goTo}
                onLaunch={() => {
                  onLaunch(normalizeDraft(draft));
                }}
              />
            )}
            {screen === "settings" && (
              <SettingsScreen
                draft={draft}
                set={set}
                tab={settingsTab}
                onRedeem={onRedeem}
                onReplayOnboarding={onReplayOnboarding}
                onTabChange={setSettingsTab}
              />
            )}
            {screen === "permissions" && <PermissionsScreen permissions={readiness.permissions} />}
            {screen === "updates" && (
              <UpdatesScreen updater={updater} checkState={checkState} onCheck={checkUpdates} />
            )}
            {screen === "contexts" && (
              <ScreenShell screen="contexts">
                <ContextLibraryPanel api={contextLibrary} />
              </ScreenShell>
            )}
            {screen === "presets" && (
              <ScreenShell screen="presets">
                <PresetsSection presets={draft.prompt_presets} onChange={changePresets} />
              </ScreenShell>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
