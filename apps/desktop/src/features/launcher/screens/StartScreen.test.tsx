import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { permissionRowCopy } from "@/features/settings/permission-rows";
import type { PermissionsApi } from "@/hooks/usePermissions";
import { getDict } from "@/i18n";
import type { PermissionsStatus } from "@/ipc/types";
import { apiKeyInfo } from "@/lib/api-keys";
import type { LauncherDestination } from "../contract";
import type { LauncherReadiness } from "../useLauncherReadiness";
vi.mock("@/ipc/events", () => ({ onEvent: () => () => undefined }));
vi.mock("@/ipc/commands", () => ({
  checkAudioSource: () => Promise.resolve({ heard: true, peak: 0.3, text: "проверка" }),
}));

import { AudioCheckProvider } from "../AudioCheckProvider";
import { StartScreen } from "./StartScreen";

const ACCESS_STEP = getDict().common.apiKeys.accessTitle;
const AUDIO_STEP = permissionRowCopy("audio", getDict()).title;
const MICROPHONE_STEP = permissionRowCopy("microphone", getDict()).title;

function copy() {
  return getDict().launcher.start;
}

function permissionButtons() {
  return getDict().settings.permissions;
}

const ALL_GRANTED: PermissionsStatus = {
  audio: "granted",
  screen: "granted",
  microphone: "granted",
};

function permissionsApi(
  status: PermissionsStatus,
  overrides: Partial<PermissionsApi> = {},
): PermissionsApi {
  return {
    status,
    loaded: true,
    audioOk: status.audio === "granted",
    microphoneOk: status.microphone === "granted",
    pending: null,
    awaiting: null,
    request: vi.fn(() => Promise.resolve()),
    openSettings: vi.fn(),
    refresh: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
}

function readiness(overrides: Partial<LauncherReadiness> = {}): LauncherReadiness {
  return {
    missingKeys: [],
    permissions: permissionsApi(ALL_GRANTED),
    autoModeEnabled: false,
    blockers: [],
    checking: false,
    ready: true,
    ...overrides,
  };
}

function renderScreen(overrides: {
  readiness?: LauncherReadiness;
  launching?: boolean;
  onRedeem?: (code: string) => Promise<string | null>;
  onNavigate?: (destination: LauncherDestination) => void;
  onLaunch?: () => void;
}) {
  const props = {
    readiness: overrides.readiness ?? readiness(),
    launching: overrides.launching ?? false,
    recordCombo: "Cmd+R",
    onRedeem: overrides.onRedeem ?? vi.fn(() => Promise.resolve(null)),
    onNavigate: overrides.onNavigate ?? vi.fn(),
    onLaunch: overrides.onLaunch ?? vi.fn(),
  };
  render(
    <AudioCheckProvider>
      <StartScreen {...props} />
    </AudioCheckProvider>,
  );
  return props;
}

function step(name: string) {
  return within(screen.getByRole("group", { name }));
}

function launchButton(): HTMLButtonElement {
  const button = screen.getByText(getDict().launcher.launch.idle).closest("button");
  if (!button) throw new Error("кнопка запуска не найдена");
  return button;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("StartScreen", () => {
  it("готовое состояние показывает оба шага закрытыми и разрешает запуск", () => {
    const { onLaunch } = renderScreen({});
    expect(step(ACCESS_STEP).getByText(copy().stepStates.done)).not.toBeNull();
    expect(step(AUDIO_STEP).getByText(copy().stepStates.done)).not.toBeNull();
    expect(screen.getByText(copy().summaryReady)).not.toBeNull();
    fireEvent.click(launchButton());
    expect(onLaunch).toHaveBeenCalledTimes(1);
  });

  it("без ключей шаг доступа предлагает код прямо на старте", () => {
    renderScreen({
      readiness: readiness({ missingKeys: [apiKeyInfo("anthropic")], ready: false }),
    });
    const access = step(ACCESS_STEP);
    expect(access.getByText(copy().stepStates.todo)).not.toBeNull();
    expect(access.getByPlaceholderText("XXXXX-XXXXX-XXXXX-XXXXX")).not.toBeNull();
    expect(launchButton().disabled).toBe(true);
  });

  it("введённый код доступа уходит в redeem, не покидая старта", () => {
    const onRedeem = vi.fn(() => Promise.resolve(null));
    renderScreen({
      readiness: readiness({ missingKeys: [apiKeyInfo("groq")], ready: false }),
      onRedeem,
    });
    const input = step(ACCESS_STEP).getByPlaceholderText("XXXXX-XXXXX-XXXXX-XXXXX");
    fireEvent.change(input, { target: { value: "AAAAA-BBBBB-CCCCC-DDDDD" } });
    fireEvent.click(step(ACCESS_STEP).getByText(getDict().common.accessCode.submit));
    expect(onRedeem).toHaveBeenCalledExactlyOnceWith("AAAAA-BBBBB-CCCCC-DDDDD");
  });

  it("«Ввести свои ключи» ведёт на вкладку ключей", () => {
    const { onNavigate } = renderScreen({
      readiness: readiness({ missingKeys: [apiKeyInfo("groq")], ready: false }),
    });
    fireEvent.click(screen.getByText(copy().enterKeys));
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith({ screen: "settings", tab: "access" });
  });

  it("невыданный доступ к звуку запрашивается кнопкой на старте", () => {
    const permissions = permissionsApi({
      audio: "unknown",
      screen: "granted",
      microphone: "granted",
    });
    renderScreen({ readiness: readiness({ permissions, ready: false }) });
    fireEvent.click(step(AUDIO_STEP).getByText(permissionButtons().grant));
    expect(permissions.request).toHaveBeenCalledExactlyOnceWith("audio");
    fireEvent.click(step(AUDIO_STEP).getByText(permissionButtons().openSettings));
    expect(permissions.openSettings).toHaveBeenCalledExactlyOnceWith("audio");
  });

  it("пока доступы не опрошены, старт не пугает ложной тревогой и не пускает в запуск", () => {
    const permissions = permissionsApi({
      audio: "unknown",
      screen: "unknown",
      microphone: "unknown",
    });
    renderScreen({ readiness: readiness({ permissions, checking: true, ready: false }) });
    expect(step(AUDIO_STEP).getByText(copy().stepStates.checking)).not.toBeNull();
    expect(step(AUDIO_STEP).queryByText(permissionButtons().grant)).toBeNull();
    expect(screen.getByText(copy().summaryChecking)).not.toBeNull();
    expect(launchButton().disabled).toBe(true);
  });

  it("во время запуска кнопка занята и повторно не срабатывает", () => {
    const { onLaunch } = renderScreen({ launching: true });
    const button = screen.getByText(getDict().launcher.launch.busy).closest("button");
    if (!button) throw new Error("кнопка запуска не найдена");
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onLaunch).not.toHaveBeenCalled();
  });

  it("«Все доступы» ведёт на экран доступов — необязательные живут только там", () => {
    const { onNavigate } = renderScreen({});
    fireEvent.click(step(AUDIO_STEP).getByText(copy().allPermissions));
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith({ screen: "permissions", tab: undefined });
  });

  it("проверка звука стоит рядом с шагами: доступ выдан — ещё не значит, что слышно", () => {
    renderScreen({});
    const audioCheck = getDict().launcher.audioCheck;
    expect(screen.getByText(audioCheck.title)).not.toBeNull();
    expect(screen.getByText(audioCheck.sources.system.label)).not.toBeNull();
    expect(screen.queryByText(audioCheck.sources.microphone.label)).toBeNull();
  });

  it("при автослушании появляются и микрофонный шаг, и его проверка", () => {
    renderScreen({ readiness: readiness({ autoModeEnabled: true }) });
    expect(screen.getByRole("group", { name: MICROPHONE_STEP })).not.toBeNull();
    expect(screen.getAllByText(MICROPHONE_STEP).length).toBeGreaterThan(1);
  });

  it("«Все настройки» уводит на экран настроек, ничего не выбирая за пользователя", () => {
    const { onNavigate } = renderScreen({});
    fireEvent.click(screen.getByText(copy().allSettings));
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith({ screen: "settings" });
  });
});
