import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PermissionsApi } from "@/hooks/usePermissions";
import { LaunchBar } from "./LaunchBar";
import type { LauncherBlocker, LauncherReadiness } from "./useLauncherReadiness";

const PERMISSIONS_STUB = {} as PermissionsApi;

function readiness(overrides: Partial<LauncherReadiness> = {}): LauncherReadiness {
  return {
    missingKeys: [],
    permissions: PERMISSIONS_STUB,
    autoModeEnabled: false,
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
  it("во время проверки звука шапка говорит, что идёт запись", () => {
    render(
      <LaunchBar
        readiness={readiness()}
        launching={false}
        saveState="idle"
        audioCheckRunning={true}
        onRetrySave={vi.fn()}
        search={null}
        onGoToBlocker={vi.fn()}
        onLaunch={vi.fn()}
      />,
    );
    expect(screen.getByText("Слушаю")).not.toBeNull();
    expect(screen.getByText("проверка звука")).not.toBeNull();
  });

  it("пока доступы не опрошены, запуск заблокирован без ложной тревоги", () => {
    render(
      <LaunchBar
        readiness={readiness({ checking: true, ready: false })}
        launching={false}
        saveState="idle"
        audioCheckRunning={false}
        onRetrySave={vi.fn()}
        search={null}
        onGoToBlocker={vi.fn()}
        onLaunch={vi.fn()}
      />,
    );
    expect(screen.getByText("Проверяю доступы")).not.toBeNull();
    expect(launchButton().disabled).toBe(true);
  });

  it("готовое состояние разрешает запуск", () => {
    const onLaunch = vi.fn();
    render(
      <LaunchBar
        readiness={readiness()}
        launching={false}
        saveState="idle"
        audioCheckRunning={false}
        onRetrySave={vi.fn()}
        search={null}
        onGoToBlocker={vi.fn()}
        onLaunch={onLaunch}
      />,
    );
    expect(screen.getByText("Всё готово")).not.toBeNull();
    fireEvent.click(launchButton());
    expect(onLaunch).toHaveBeenCalledTimes(1);
  });

  // Раньше «Сохраняю…» занимало ту же строку, что и блокер, и было выше его по
  // приоритету: подтверждение сохранения на 600 мс прятало ровно то, что
  // пользователю только что велели починить.
  it("сохранение не вытесняет блокер — у него своя строка", () => {
    render(
      <LaunchBar
        readiness={readiness({ ready: false, blockers: [AUDIO_BLOCKER] })}
        launching={false}
        saveState="saving"
        audioCheckRunning={false}
        onRetrySave={vi.fn()}
        search={null}
        onGoToBlocker={vi.fn()}
        onLaunch={vi.fn()}
      />,
    );
    expect(screen.getByText("Сохраняю")).not.toBeNull();
    expect(screen.getByText(AUDIO_BLOCKER.label)).not.toBeNull();
  });

  it("блокер назван словами и ведёт на свой экран", () => {
    const onGoToBlocker = vi.fn();
    render(
      <LaunchBar
        readiness={readiness({ ready: false, blockers: [AUDIO_BLOCKER] })}
        launching={false}
        saveState="idle"
        audioCheckRunning={false}
        onRetrySave={vi.fn()}
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
