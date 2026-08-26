import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PermissionsApi } from "@/hooks/usePermissions";
import type { PermissionsStatus } from "@/ipc/bindings";
import { apiKeyInfo } from "@/lib/api-keys";
import type { LauncherDestination } from "../contract";
import type { LauncherReadiness } from "../useLauncherReadiness";
vi.mock("@/ipc/events", () => ({ onEvent: () => () => undefined }));
vi.mock("@/ipc/commands", () => ({
  checkAudioSource: () => Promise.resolve({ heard: true, peak: 0.3, text: "проверка" }),
}));

import type { AudioCheckApi } from "@/hooks/useAudioCheck";
import { StartScreen } from "./StartScreen";

const IDLE_AUDIO_CHECK: AudioCheckApi = {
  running: null,
  level: 0,
  source: null,
  result: null,
  run: () => undefined,
};

const ACCESS_STEP = "Доступ к API";
const AUDIO_STEP = "Запись системного звука";

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
    screenOk: status.screen === "granted",
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
    audioCheck: IDLE_AUDIO_CHECK,
    recordCombo: "Cmd+R",
    onRedeem: overrides.onRedeem ?? vi.fn(() => Promise.resolve(null)),
    onNavigate: overrides.onNavigate ?? vi.fn(),
    onLaunch: overrides.onLaunch ?? vi.fn(),
  };
  render(<StartScreen {...props} />);
  return props;
}

function step(name: string) {
  return within(screen.getByRole("group", { name }));
}

function launchButton(): HTMLButtonElement {
  const button = screen.getByText("Запустить").closest("button");
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
    expect(step(ACCESS_STEP).getByText("готово")).not.toBeNull();
    expect(step(AUDIO_STEP).getByText("готово")).not.toBeNull();
    expect(screen.getByText("Всё готово — можно запускать.")).not.toBeNull();
    fireEvent.click(launchButton());
    expect(onLaunch).toHaveBeenCalledTimes(1);
  });

  it("без ключей шаг доступа предлагает код прямо на старте", () => {
    renderScreen({
      readiness: readiness({ missingKeys: [apiKeyInfo("anthropic")], ready: false }),
    });
    const access = step(ACCESS_STEP);
    expect(access.getByText("нужно сделать")).not.toBeNull();
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
    fireEvent.click(step(ACCESS_STEP).getByText("Активировать"));
    expect(onRedeem).toHaveBeenCalledExactlyOnceWith("AAAAA-BBBBB-CCCCC-DDDDD");
  });

  it("«Ввести свои ключи» ведёт на вкладку ключей", () => {
    const { onNavigate } = renderScreen({
      readiness: readiness({ missingKeys: [apiKeyInfo("groq")], ready: false }),
    });
    fireEvent.click(screen.getByText("Ввести свои ключи"));
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith({ screen: "settings", tab: "access" });
  });

  it("невыданный доступ к звуку запрашивается кнопкой на старте", () => {
    const permissions = permissionsApi({
      audio: "unknown",
      screen: "granted",
      microphone: "granted",
    });
    renderScreen({ readiness: readiness({ permissions, ready: false }) });
    fireEvent.click(step(AUDIO_STEP).getByText("Выдать"));
    expect(permissions.request).toHaveBeenCalledExactlyOnceWith("audio");
    fireEvent.click(step(AUDIO_STEP).getByText("Настройки"));
    expect(permissions.openSettings).toHaveBeenCalledExactlyOnceWith("audio");
  });

  it("пока доступы не опрошены, старт не пугает ложной тревогой и не пускает в запуск", () => {
    const permissions = permissionsApi({
      audio: "unknown",
      screen: "unknown",
      microphone: "unknown",
    });
    renderScreen({ readiness: readiness({ permissions, checking: true, ready: false }) });
    expect(step(AUDIO_STEP).getByText("проверяю…")).not.toBeNull();
    expect(step(AUDIO_STEP).queryByText("Выдать")).toBeNull();
    expect(screen.getByText("Проверяю доступы…")).not.toBeNull();
    expect(launchButton().disabled).toBe(true);
  });

  it("во время запуска кнопка занята и повторно не срабатывает", () => {
    const { onLaunch } = renderScreen({ launching: true });
    const button = screen.getByText("Запускаю…").closest("button");
    if (!button) throw new Error("кнопка запуска не найдена");
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onLaunch).not.toHaveBeenCalled();
  });

  it("«Все доступы» ведёт на экран доступов — необязательные живут только там", () => {
    const { onNavigate } = renderScreen({});
    fireEvent.click(step(AUDIO_STEP).getByText("Все доступы"));
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith({ screen: "permissions", tab: undefined });
  });

  it("проверка звука стоит рядом с шагами: доступ выдан — ещё не значит, что слышно", () => {
    renderScreen({});
    expect(screen.getByText("Проверка звука")).not.toBeNull();
    expect(screen.getByText("Системный звук")).not.toBeNull();
    expect(screen.queryByText("Микрофон")).toBeNull();
  });

  it("при автослушании появляются и микрофонный шаг, и его проверка", () => {
    renderScreen({ readiness: readiness({ autoModeEnabled: true }) });
    expect(screen.getByRole("group", { name: "Микрофон" })).not.toBeNull();
    expect(screen.getAllByText("Микрофон").length).toBeGreaterThan(1);
  });

  it("«Все настройки» уводит на экран настроек, ничего не выбирая за пользователя", () => {
    const { onNavigate } = renderScreen({});
    fireEvent.click(screen.getByText("Все настройки"));
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith({ screen: "settings" });
  });
});
