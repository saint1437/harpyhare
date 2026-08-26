import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PermissionsApi } from "@/hooks/usePermissions";
import type { Readiness } from "@/features/settings/readiness";
import { format, getDict } from "@/i18n";
import { DEFAULT_SETTINGS, type Settings } from "@/ipc/types";
import { apiKeyInfo } from "@/lib/api-keys";

vi.mock("@/ipc/events", () => ({ onEvent: () => () => undefined }));
vi.mock("@/ipc/commands", () => ({
  probeConnectivity: () => Promise.resolve(true),
  startWindowDrag: () => Promise.resolve(),
  openExternal: () => Promise.resolve(),
}));

import { fakeSecrets } from "@/test-utils/fake-secrets";
import { OnboardingGate } from "./OnboardingGate";

const AUTOSAVE_DEBOUNCE_MS = 600;

const dict = getDict();
const BUFFER_SWITCH_LABEL = dict.onboarding.privacy.toggles.buffer.label;
const ANTHROPIC_KEY_LABEL = format(dict.settings.apiKeys.keyLabel, {
  name: apiKeyInfo("anthropic").name,
});
// The three buttons of a key field differ only by the key's name inside the
// aria-label, so the expected name is assembled the way the field assembles it.
const SAVE_ANTHROPIC_KEY = `${dict.settings.apiKeys.saveKey} — ${ANTHROPIC_KEY_LABEL}`;
const OWN_KEYS_BUTTON = dict.onboarding.access.ownKeys;
const OPEN_LAUNCHER = dict.onboarding.ready.openLauncher;
const NEXT = dict.common.actions.next;

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

const READINESS: Readiness = {
  missingKeys: [],
  permissions: PERMISSIONS,
  autoModeEnabled: false,
  blockers: [],
  checking: false,
  ready: true,
};

/** Ключей нет — поток обязан начаться с шага доступа. */
const UNCONFIGURED: Readiness = {
  ...READINESS,
  missingKeys: [apiKeyInfo("anthropic"), apiKeyInfo("groq")],
  ready: false,
};

function renderGate({
  settings = DEFAULT_SETTINGS,
  readiness = READINESS,
}: { settings?: Settings; readiness?: Readiness } = {}) {
  const onPersist = vi.fn();
  const onFinish = vi.fn();
  const secrets = fakeSecrets();
  const gate = (next: Settings) => (
    <OnboardingGate
      settings={next}
      readiness={readiness}
      secrets={secrets}
      launching={false}
      onPersist={onPersist}
      onLaunch={() => undefined}
      onFinish={onFinish}
    />
  );
  const view = render(gate(settings));
  const rerender = (next: Settings) => {
    view.rerender(gate(next));
  };
  return { onPersist, onFinish, secrets, rerender };
}

/** Черновик правится на шаге приватности — там живут переключатели. */
function goToPrivacy() {
  while (screen.queryByLabelText(BUFFER_SWITCH_LABEL) === null) {
    const next = screen.queryByRole("button", { name: NEXT });
    if (next === null) throw new Error("шаг приватности недостижим");
    fireEvent.click(next);
  }
}

function walkToTheEnd() {
  for (;;) {
    const next = screen.queryByRole("button", { name: NEXT });
    if (next === null) break;
    fireEvent.click(next);
  }
}

function tick(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("OnboardingGate", () => {
  it("правка черновика сохраняется сама, с задержкой", () => {
    const { onPersist } = renderGate();
    goToPrivacy();
    fireEvent.click(screen.getByLabelText(BUFFER_SWITCH_LABEL));
    expect(onPersist).not.toHaveBeenCalled();
    tick(AUTOSAVE_DEBOUNCE_MS);
    expect(onPersist).toHaveBeenCalledTimes(1);
    expect(onPersist.mock.calls[0]?.[0]).toMatchObject({ buffer_enabled: false });
  });

  it("на первом рендере ничего не пишет", () => {
    const { onPersist } = renderGate();
    tick(AUTOSAVE_DEBOUNCE_MS * 3);
    expect(onPersist).not.toHaveBeenCalled();
  });

  // Иначе сохранение без onboarding_done приземляется ПОСЛЕ финального и
  // онбординг начинается заново при следующем запуске.
  it("финал отменяет отложенное сохранение", () => {
    const { onPersist, onFinish } = renderGate();
    goToPrivacy();
    fireEvent.click(screen.getByLabelText(BUFFER_SWITCH_LABEL));
    // Правка есть, но её таймер ещё не сработал — именно она и не должна
    // приземлиться после финального сохранения.
    expect(onPersist).not.toHaveBeenCalled();
    walkToTheEnd();
    fireEvent.click(screen.getByRole("button", { name: OPEN_LAUNCHER }));
    expect(onFinish).toHaveBeenCalledTimes(1);
    tick(AUTOSAVE_DEBOUNCE_MS * 3);
    expect(onPersist).not.toHaveBeenCalled();
  });

  /**
   * Раньше здесь подмешивался `access_token`: погашение кода писало его в
   * settings.json за спиной формы, и черновик приходилось чинить эффектом.
   * Секреты живут в своём хранилище — подмешивать нечего, и лишний рендер
   * настроек не имеет права разбудить автосохранение.
   */
  it("перерисовка тех же настроек не запускает сохранение", () => {
    const { onPersist, rerender } = renderGate();
    act(() => {
      rerender({ ...DEFAULT_SETTINGS });
    });
    tick(AUTOSAVE_DEBOUNCE_MS * 3);
    expect(onPersist).not.toHaveBeenCalled();
  });

  /**
   * Ключ уходит своей командой и мимо черновика — иначе автосохранение
   * онбординга снова носило бы копию секрета в `set_settings`.
   */
  it("ключ пишется командой, а не через черновик", () => {
    const { onPersist, secrets } = renderGate({ readiness: UNCONFIGURED });
    fireEvent.click(screen.getByRole("button", { name: new RegExp(OWN_KEYS_BUTTON) }));
    fireEvent.change(screen.getByLabelText(ANTHROPIC_KEY_LABEL), {
      target: { value: "sk-ant-x" },
    });
    fireEvent.click(screen.getByRole("button", { name: SAVE_ANTHROPIC_KEY }));

    expect(secrets.setKey).toHaveBeenCalledWith("anthropic", "sk-ant-x");
    tick(AUTOSAVE_DEBOUNCE_MS * 3);
    expect(onPersist).not.toHaveBeenCalled();
  });
});
