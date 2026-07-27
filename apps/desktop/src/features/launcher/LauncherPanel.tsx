import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { Settings } from "@/ipc/types";
import { isPresetFilled } from "@/lib/presets";
import { ContextLibraryPanel } from "./ContextLibraryPanel";
import type { LauncherPanelProps, SetSetting } from "./contract";
import { IdentityPanel } from "./IdentityPanel";
import { LaunchBar } from "./LaunchBar";
import { DEFAULT_SCREEN, type ScreenId } from "./screens";
import { PermissionsScreen } from "./screens/PermissionsScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { UpdatesScreen, type CheckState } from "./screens/UpdatesScreen";
import { ScreenShell } from "./ScreenShell";
import { PresetsSection, type PresetsUpdate } from "./sections/PresetsSection";
import { Sidebar } from "./Sidebar";

const RISE_STEP_MS = 70;
const AUTOSAVE_DEBOUNCE_MS = 600;

function riseDelay(order: number): CSSProperties {
  return { animationDelay: `${String(order * RISE_STEP_MS)}ms` };
}

function normalizeDraft(draft: Settings): Settings {
  return {
    ...draft,
    prompt_presets: draft.prompt_presets.filter(isPresetFilled),
  };
}

export function LauncherPanel({
  settings,
  contextLibrary,
  readiness,
  updater,
  launching,
  error,
  onRedeem,
  onCheckUpdates,
  onSave,
  onLaunch,
}: LauncherPanelProps) {
  const [draft, setDraft] = useState<Settings>(settings);
  const [checkState, setCheckState] = useState<CheckState>("idle");
  const [screen, setScreen] = useState<ScreenId>(DEFAULT_SCREEN);

  const landed = useRef(false);
  useEffect(() => {
    if (landed.current || readiness.checking) return;
    landed.current = true;
    const blocker = readiness.blockers[0];
    if (blocker) setScreen(blocker.screen);
  }, [readiness.checking, readiness.blockers]);

  useEffect(() => {
    setDraft((d) =>
      d.access_token === settings.access_token ? d : { ...d, access_token: settings.access_token },
    );
  }, [settings.access_token]);

  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  const lastQueuedDraft = useRef(draft);
  useEffect(() => {
    if (launching || draft === lastQueuedDraft.current) return;
    lastQueuedDraft.current = draft;
    const timer = setTimeout(() => {
      onSaveRef.current(normalizeDraft(draft));
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
    <div className="flex h-screen flex-col gap-3 px-4 pt-3 pb-4 sm:px-5">
      <div className="launcher-rise" style={riseDelay(0)}>
        <LaunchBar
          readiness={readiness}
          launching={launching}
          error={error}
          onGoToBlocker={setScreen}
          onLaunch={() => {
            onLaunch(normalizeDraft(draft));
          }}
        />
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 gap-4 md:gap-6">
        <div className="launcher-rise flex min-h-0" style={riseDelay(1)}>
          <Sidebar
            active={screen}
            attention={readiness.blockers.map((b) => b.screen)}
            onSelect={setScreen}
          />
        </div>
        <div className="launcher-rise flex min-h-0 min-w-0 flex-1" style={riseDelay(2)}>
          {screen === "settings" && <SettingsScreen draft={draft} set={set} onRedeem={onRedeem} />}
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
          {screen === "identity" && (
            <ScreenShell screen="identity">
              <IdentityPanel currentIdentityId={settings.identity_id} />
            </ScreenShell>
          )}
        </div>
      </div>
    </div>
  );
}
