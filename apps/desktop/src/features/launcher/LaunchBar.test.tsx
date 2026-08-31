import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PermissionsApi } from "@/hooks/usePermissions";
import { LaunchBar } from "./LaunchBar";
import type { LauncherBlocker, LauncherReadiness } from "./useLauncherReadiness";

const PERMISSIONS_STUB = {} as PermissionsApi;

function readiness(overrides: Partial<LauncherReadiness> = {}): LauncherReadiness {
  return {
    gaps: [],
    permissions: PERMISSIONS_STUB,
    blockers: [],
    checking: false,
    ready: true,
    ...overrides,
  };
}

const AUDIO_BLOCKER: LauncherBlocker = {
  label: "Нет доступа к записи системного звука",
  screen: "permissions",
};

function launchButton(): HTMLButtonElement {
  const button = screen.getByText("Запустить").closest("button");
  if (!button) throw new Error("кнопка запуска не найдена");
  return button;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("LaunchBar", () => {
  it("пока доступы не опрошены, запуск заблокирован без ложной тревоги", () => {
    render(
      <LaunchBar
        readiness={readiness({ checking: true, ready: false })}
        launching={false}
        saving={false}
        search={null}
        onGoToBlocker={vi.fn()}
        onLaunch={vi.fn()}
      />,
    );
    expect(screen.getByText("Проверяю доступы…")).not.toBeNull();
    expect(launchButton().disabled).toBe(true);
  });

  it("готовое состояние разрешает запуск", () => {
    const onLaunch = vi.fn();
    render(
      <LaunchBar
        readiness={readiness()}
        launching={false}
        saving={false}
        search={null}
        onGoToBlocker={vi.fn()}
        onLaunch={onLaunch}
      />,
    );
    expect(screen.getByText("Всё готово к запуску")).not.toBeNull();
    fireEvent.click(launchButton());
    expect(onLaunch).toHaveBeenCalledTimes(1);
  });

  it("пока настройки сохраняются, статус говорит об этом", () => {
    render(
      <LaunchBar
        readiness={readiness({ ready: false, blockers: [AUDIO_BLOCKER] })}
        launching={false}
        saving={true}
        search={null}
        onGoToBlocker={vi.fn()}
        onLaunch={vi.fn()}
      />,
    );
    expect(screen.getByText("Сохраняю…")).not.toBeNull();
    expect(screen.queryByText(AUDIO_BLOCKER.label)).toBeNull();
  });

  it("блокер назван словами и ведёт на свой экран", () => {
    const onGoToBlocker = vi.fn();
    render(
      <LaunchBar
        readiness={readiness({ ready: false, blockers: [AUDIO_BLOCKER] })}
        launching={false}
        saving={false}
        search={null}
        onGoToBlocker={onGoToBlocker}
        onLaunch={vi.fn()}
      />,
    );
    expect(launchButton().disabled).toBe(true);
    fireEvent.click(screen.getByText(AUDIO_BLOCKER.label));
    expect(onGoToBlocker).toHaveBeenCalledWith(AUDIO_BLOCKER);
  });
});
