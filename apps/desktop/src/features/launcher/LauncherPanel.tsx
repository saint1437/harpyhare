import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { NotificationStack } from "@/components/NotificationStack";
import type { SetSetting } from "@/features/settings/contract";
import { DEFAULT_SETTINGS_TAB, type SettingsTabId } from "@/features/settings/settings-tabs";
import { useAutosavedDraft } from "@/features/settings/useAutosavedDraft";
import { useConnectivity } from "@/hooks/useConnectivity";
import { useDict } from "@/hooks/useDict";
import { useOfficialPresets } from "@/hooks/useOfficialPresets";
import { format } from "@/i18n";
import type { Settings } from "@/ipc/types";
import { effectiveCombo } from "@/lib/hotkeys";
import { notifyError } from "@/lib/notifications";
import { isPresetFilled, mergePresets } from "@/lib/presets";
import { isQuickActionFilled } from "@/lib/quick-actions";
import { useAudioCheckControl } from "./audio-check";
import { AudioCheckProvider } from "./AudioCheckProvider";
import { ContextLibraryPanel } from "./ContextLibraryPanel";
import type { LauncherDestination, LauncherPanelProps } from "./contract";
import { LaunchBar } from "./LaunchBar";
import { LauncherSearch } from "./LauncherSearch";
import { DEFAULT_SCREEN, type ScreenId } from "./screens";
import { PermissionsScreen } from "./screens/PermissionsScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { StartScreen } from "./screens/StartScreen";
import { UpdatesScreen, type CheckState } from "./screens/UpdatesScreen";
import { ScreenShell } from "./ScreenShell";
import { PresetsSection, type PresetsUpdate } from "./sections/PresetsSection";
import { Sidebar, type SidebarNotice } from "./Sidebar";
import type { SaveState } from "./StatusObject";
import { panelId, panelProps } from "./useRovingTabs";

const RECORD_ACTION = "record";
const RISE_STEP_MS = 50;

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

// Compared BY VALUE, not by identity: the set_settings round trip returns
// fresh objects, so for array fields (hotkeys etc.) `sent !== settings` was
// always true — adoption copied a content-identical array into a new draft,
// the new draft re-armed the autosave, and the launcher wrote settings.json
// every 600 ms for the rest of the session. The draft side is value-compared
// too, so a genuinely clamped array now adopts as well.
function sameSettingValue(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

function sameSettings(a: Settings, b: Settings): boolean {
  return (Object.keys(a) as (keyof Settings)[]).every((key) => sameSettingValue(a[key], b[key]));
}

/**
 * The sound check is mounted here, above the body, and the body is handed to it
 * as a ready-made element: the level ticking ten times a second then stops at
 * `AudioCheckProvider` instead of walking the whole launcher (see `audio-check`).
 */
export function LauncherPanel(props: LauncherPanelProps) {
  return (
    <AudioCheckProvider>
      <LauncherPanelBody {...props} />
    </AudioCheckProvider>
  );
}

function LauncherPanelBody({
  settings,
  contextLibrary,
  readiness,
  secrets,
  updater,
  launching,
  saving,
  saveFailed,
  onSave,
  onLaunch,
  onReplayOnboarding,
}: LauncherPanelProps) {
  const [draft, setDraft] = useState<Settings>(settings);
  const [checkState, setCheckState] = useState<CheckState>("idle");
  const [screen, setScreen] = useState<ScreenId>(DEFAULT_SCREEN);
  const [settingsTab, setSettingsTab] = useState<SettingsTabId>(DEFAULT_SETTINGS_TAB);

  const dict = useDict();

  const official = useOfficialPresets();
  const audioCheck = useAudioCheckControl();
  // Что именно ушло в `set_settings` последним — и для адоптации клампа, и для
  // повтора неудавшегося сохранения.
  const lastSavedRef = useRef<Settings | null>(null);
  // Лаунчер до сих пор не знал про сеть вовсе: погашение кода без интернета
  // печатало сырую английскую строку reqwest в русский интерфейс.
  const connectivity = useConnectivity();

  const saveState: SaveState = saveFailed
    ? "failed"
    : saving
      ? "saving"
      : lastSavedRef.current === null
        ? "idle"
        : "saved";

  const retrySave = useCallback(() => {
    const pending = lastSavedRef.current;
    if (pending !== null) onSave(pending);
  }, [onSave]);

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
              label: format(dict.launcher.shell.updateAvailable, {
                version: updater.info.version,
              }),
              kind: "info",
            } as const satisfies SidebarNotice,
          ]),
    ],
    [readiness.blockers, updater.info, dict],
  );

  const goTo = useCallback(({ screen: target, tab }: LauncherDestination) => {
    setScreen(target);
    if (tab !== undefined) setSettingsTab(tab);
  }, []);

  // Rust возвращает КЛАМПНУТЫЕ настройки, и адоптировать их обязательно: иначе
  // после того как `Settings::clamp` снял конфликтующий хоткей или обрезал
  // список быстрых действий, лаунчер продолжал показывать то, чего на диске уже
  // нет. Свой же черновик не перетираем — только то, что бэкенд изменил сам.
  //
  // Ветки «мы ещё ничего не сохраняли» больше нет: она существовала ровно для
  // одного поля — токена доступа, который погашение кода писало за спиной формы.
  // Секреты ушли из `Settings` в собственное хранилище, и подмешивать в черновик
  // стало нечего.
  useEffect(() => {
    setDraft((d) => {
      const sent = lastSavedRef.current;
      if (sent === null) return d;
      const adopted = { ...d };
      let changed = false;
      for (const key of Object.keys(settings) as (keyof Settings)[]) {
        if (!sameSettingValue(sent[key], settings[key]) && sameSettingValue(d[key], sent[key])) {
          (adopted as Record<string, unknown>)[key] = settings[key];
          changed = true;
        }
      }
      return changed ? adopted : d;
    });
  }, [settings]);

  // Only the copy being saved is normalised — the draft on screen keeps the
  // half-filled preset or quick action the user is still typing into.
  useAutosavedDraft(draft, launching, (next) => {
    const normalized = normalizeDraft(next);
    // Adopting a clamped answer builds a NEW draft object, which re-arms the
    // timer — so the launcher used to write the very value Rust had just handed
    // back (save → adopt → re-render → save). The guard is by VALUE against
    // what is already on disk, never by skipping a render: an identity-based
    // skip would swallow an edit made while the round trip was in flight.
    if (sameSettings(normalized, settings)) return;
    lastSavedRef.current = normalized;
    onSave(normalized);
  });

  const checkUpdates = useCallback(() => {
    setCheckState("checking");
    updater
      .checkNow()
      .then((found) => {
        setCheckState(found ? "idle" : "latest");
      })
      .catch((e: unknown) => {
        setCheckState("idle");
        notifyError(dict.launcher.shell.updateCheckFailedTitle, String(e));
      });
  }, [updater, dict]);

  // Stable by construction: the rows of the active tab are memoised on their own
  // value plus this callback, and a `set` rebuilt on every render would make
  // every one of those memos useless.
  const set: SetSetting = useCallback((key, value) => {
    setDraft((d) => ({ ...d, [key]: value }));
  }, []);

  const changePresets = useCallback((update: PresetsUpdate) => {
    setDraft((d) => ({ ...d, prompt_presets: update(d.prompt_presets) }));
  }, []);

  // Exhaustive by type, the way `SettingsScreen` renders its tabs: a chain of
  // `screen === "…" &&` compiled just as happily with a screen missing, so
  // adding one to LAUNCHER_SCREENS gave a sidebar item, a search hit and
  // breadcrumbs — over an empty panel. The compiler now asks for the branch.
  //
  // The branches are thunks rather than elements: as a record of elements all six
  // screens were built on every render — `effectiveCombo` and all — while five of
  // them were thrown away unrendered. Only the active one is called, and the
  // record still has to name every screen.
  const panels: Record<ScreenId, () => ReactNode> = {
    start: () => (
      <StartScreen
        readiness={readiness}
        launching={launching}
        recordCombo={effectiveCombo(draft.hotkeys, RECORD_ACTION)}
        onRedeem={secrets.redeem}
        onNavigate={goTo}
        onLaunch={() => {
          onLaunch(normalizeDraft(draft));
        }}
      />
    ),
    contexts: () => (
      <ScreenShell screen="contexts">
        <ContextLibraryPanel api={contextLibrary} />
      </ScreenShell>
    ),
    presets: () => (
      <ScreenShell screen="presets">
        <PresetsSection presets={draft.prompt_presets} onChange={changePresets} />
      </ScreenShell>
    ),
    settings: () => (
      <SettingsScreen
        draft={draft}
        set={set}
        tab={settingsTab}
        secrets={secrets}
        onReplayOnboarding={onReplayOnboarding}
        onTabChange={setSettingsTab}
      />
    ),
    permissions: () => <PermissionsScreen permissions={readiness.permissions} />,
    updates: () => (
      <UpdatesScreen updater={updater} checkState={checkState} onCheck={checkUpdates} />
    ),
  };

  return (
    <div className="flex h-screen flex-col gap-2.5 px-4 pt-0 pb-4 sm:px-5">
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
          <span className="min-w-0 text-body text-fg-muted">{dict.launcher.shell.offline}</span>
        </div>
      )}
      {/* Единственная поверхность для отказов обоих окон: раньше здесь стоял
          баннер во всю ширину, и сообщение вроде тела ответа Anthropic растягивало
          лаунчер, оставаясь при этом без возможности его скопировать. */}
      <NotificationStack className="w-full max-w-96 self-end" />

      <a
        href={`#${panelId(screen)}`}
        className="sr-only rounded-md bg-elevated px-3 py-1.5 text-body text-fg shadow-pop focus:not-sr-only focus:absolute focus:top-10 focus:left-5 focus:z-40"
      >
        {dict.launcher.shell.skipToContent}
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
            {panels[screen]()}
          </div>
        </div>
      </div>
    </div>
  );
}
