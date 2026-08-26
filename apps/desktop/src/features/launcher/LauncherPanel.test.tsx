import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContextLibraryApi } from "@/hooks/useContextLibrary";
import type { PermissionsApi } from "@/hooks/usePermissions";
import type { UpdaterApi } from "@/hooks/useUpdater";
import { DEFAULT_SETTINGS, type Settings } from "@/ipc/types";
import { apiKeyInfo } from "@/lib/api-keys";
import { EMPTY_LIBRARY } from "@/lib/context-library";

vi.mock("@/ipc/events", () => ({
  onEvent: () => () => undefined,
  onFileDrop: () => () => undefined,
}));
vi.mock("@/ipc/commands", () => ({
  getOfficialPresets: () => Promise.resolve([]),
  checkAudioSource: () => Promise.resolve({ heard: true, peak: 0.3, text: "" }),
  probeConnectivity: () => Promise.resolve(true),
  listAudioOutputDevices: () => Promise.resolve([]),
  listAudioInputDevices: () => Promise.resolve([]),
  openExternal: () => Promise.resolve(),
  readContextImportFile: () => Promise.resolve({ name: "", text: "" }),
  readContextPdfBytes: () => Promise.resolve(""),
}));

import { format, getDict } from "@/i18n";
import { createQueryWrapper } from "@/test/query-wrapper";
import { fakeSecrets } from "@/test-utils/fake-secrets";
import { LauncherPanel } from "./LauncherPanel";
import { LAUNCHER_SCREENS, screenCopy, screenVisible, type ScreenId } from "./screens";
import type { LauncherReadiness } from "./useLauncherReadiness";
import { panelId, tabId } from "./useRovingTabs";

// Автосохранение проверяется на обычной настройке из реестра: ключи API больше
// не часть черновика — они пишутся своей командой (см. `state/secrets`).
const TRANSLATE_ENTRY = "stt_translate";
const AUTOSAVE_DEBOUNCE_MS = 600;

function translateSwitchLabel(): string {
  return getDict().settings.entries[TRANSLATE_ENTRY].label;
}

// Подписи полей ключей собирает `ApiKeysSection` из словаря — тест берёт их
// оттуда же, иначе он ловит формулировку, а не поведение.
function anthropicKeyLabel(): string {
  return format(getDict().settings.apiKeys.keyLabel, { name: apiKeyInfo("anthropic").name });
}

function saveKeyButtonName(): string {
  return `${getDict().settings.apiKeys.saveKey} — ${anthropicKeyLabel()}`;
}

const PERMISSIONS: PermissionsApi = {
  status: { audio: "granted", screen: "granted", microphone: "granted" },
  loaded: true,
  audioOk: true,
  microphoneOk: true,
  pending: null,
  awaiting: null,
  request: () => Promise.resolve(),
  openSettings: () => undefined,
  refresh: () => Promise.resolve(),
};

const READINESS: LauncherReadiness = {
  missingKeys: [],
  permissions: PERMISSIONS,
  autoModeEnabled: false,
  blockers: [],
  checking: false,
  ready: true,
};

const UPDATER: UpdaterApi = {
  status: "idle",
  info: null,
  progress: null,
  error: null,
  currentVersion: "1.2.3",
  install: () => undefined,
  checkNow: () => Promise.resolve(null),
  dismiss: () => undefined,
};

const CONTEXT_LIBRARY: ContextLibraryApi = {
  library: EMPTY_LIBRARY,
  addFolder: () => undefined,
  renameFolder: () => undefined,
  removeFolder: () => undefined,
  addDoc: () => undefined,
  updateDoc: () => undefined,
  removeDoc: () => undefined,
  moveDoc: () => undefined,
};

function renderPanel(overrides: { settings?: Settings; onSave?: (next: Settings) => void } = {}) {
  const onSave = overrides.onSave ?? vi.fn();
  const secrets = fakeSecrets();
  const Wrapper = createQueryWrapper();
  const panel = (settings: Settings) => (
    <Wrapper>
      <LauncherPanel
        settings={settings}
        contextLibrary={CONTEXT_LIBRARY}
        readiness={READINESS}
        secrets={secrets}
        updater={UPDATER}
        launching={false}
        saving={false}
        saveFailed={false}
        onSave={onSave}
        onLaunch={() => undefined}
        onReplayOnboarding={() => undefined}
      />
    </Wrapper>
  );
  const view = render(panel(overrides.settings ?? DEFAULT_SETTINGS));
  const rerender = (settings: Settings) => {
    view.rerender(panel(settings));
  };
  return { onSave, secrets, rerender };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("LauncherPanel screens", () => {
  const visible = LAUNCHER_SCREENS.filter((s) => screenVisible(s.id));

  it.each(visible.map((s) => [s.id, screenCopy(s.id, getDict()).label] as [ScreenId, string]))(
    "screen %s renders a non-empty panel",
    (id, label) => {
      renderPanel();
      // Clicking the sidebar rather than poking state: the registry drives both
      // the item and the panel, and a screen with no branch used to give the
      // first and an empty second.
      const tab = document.getElementById(tabId(id));
      expect(tab).not.toBeNull();
      if (tab !== null) fireEvent.click(tab);

      const panel = document.getElementById(panelId(id));
      expect(panel).not.toBeNull();
      expect(panel?.textContent?.trim()).not.toBe("");
      expect(panel?.textContent).toContain(label);
    },
  );
});

describe("LauncherPanel autosave", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  function openSettings(tab?: string) {
    const settingsTab = document.getElementById(tabId("settings"));
    if (settingsTab !== null) fireEvent.click(settingsTab);
    if (tab === undefined) return;
    // Экран настроек открывается на вкладке «Доступ к API»; обычные строки
    // живут на своих — до них нужно доехать так же, как это делает мышь.
    const inner = document.getElementById(tabId(tab));
    if (inner !== null) fireEvent.click(inner);
  }

  function toggleTranslate() {
    openSettings("speech");
    fireEvent.click(screen.getByLabelText(translateSwitchLabel()));
  }

  it("persists a changed field once the debounce elapses", async () => {
    const { onSave } = renderPanel();
    toggleTranslate();

    expect(onSave).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
      await Promise.resolve();
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect((onSave as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toMatchObject({
      stt_translate: true,
    });
  });

  it("adopts the answer Rust gave back and does not autosave it back", async () => {
    const onSave = vi.fn();
    const { rerender } = renderPanel({ onSave });
    toggleTranslate();
    await act(async () => {
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
      await Promise.resolve();
    });
    expect(onSave).toHaveBeenCalledTimes(1);

    // What `set_settings` gives back is the APPLIED value, and the panel must
    // show it: without adoption the launcher kept displaying what the user chose
    // while the disk held something else.
    const applied: Settings = { ...DEFAULT_SETTINGS, stt_translate: false };
    await act(async () => {
      rerender(applied);
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(screen.getByLabelText(translateSwitchLabel()).getAttribute("aria-checked")).toBe(
        "false",
      );
    });

    // …and adopting it must not re-arm the timer: save → adopt → re-render →
    // save is the loop that wrote settings.json every 600 ms for a session.
    await act(async () => {
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS * 3);
      await Promise.resolve();
    });
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  // Ключ уходит своей командой и МИМО черновика — иначе автосохранение формы
  // снова носило бы копию секрета и затирало бы её пустой строкой.
  it("сохранение ключа идёт командой, а не через set_settings", async () => {
    const { onSave, secrets } = renderPanel();
    openSettings();
    fireEvent.change(screen.getByLabelText(anthropicKeyLabel()), {
      target: { value: "sk-ant-typed" },
    });
    fireEvent.click(screen.getByRole("button", { name: saveKeyButtonName() }));

    expect(secrets.setKey).toHaveBeenCalledWith("anthropic", "sk-ant-typed");
    await act(async () => {
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS * 3);
      await Promise.resolve();
    });
    expect(onSave).not.toHaveBeenCalled();
  });
});
