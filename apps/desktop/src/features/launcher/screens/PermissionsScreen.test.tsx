import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { permissionRowCopy } from "@/features/settings/permission-rows";
import type { PermissionsApi } from "@/hooks/usePermissions";
import { getDict } from "@/i18n";
import type { PermissionKind, PermissionsStatus } from "@/ipc/types";
import { PermissionsScreen } from "./PermissionsScreen";

function rowTitle(kind: PermissionKind): string {
  return permissionRowCopy(kind, getDict()).title;
}

const SYSTEM_AUDIO_ROW = rowTitle("audio");
const MICROPHONE_ROW = rowTitle("microphone");
const SCREEN_ROW = rowTitle("screen");

const STATES = getDict().launcher.permissions.states;
const NEEDS = getDict().settings.permissions.needs;
const BUTTONS = getDict().settings.permissions;

function api(status: PermissionsStatus, overrides: Partial<PermissionsApi> = {}): PermissionsApi {
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

function row(name: string) {
  return within(screen.getByRole("group", { name }));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PermissionsScreen", () => {
  it("собирает все доступы в одном месте со статусами", () => {
    render(
      <PermissionsScreen
        permissions={api({ audio: "granted", screen: "unknown", microphone: "denied" })}
      />,
    );
    expect(row(SYSTEM_AUDIO_ROW).getByText(STATES.granted)).not.toBeNull();
    expect(row(SCREEN_ROW).getByText(STATES.unknown)).not.toBeNull();
    expect(row(MICROPHONE_ROW).getByText(STATES.denied)).not.toBeNull();
  });

  it("строка говорит, для чего доступ нужен, а не просто «обязателен ли»", () => {
    render(
      <PermissionsScreen
        permissions={api({ audio: "granted", screen: "granted", microphone: "unknown" })}
      />,
    );
    // Микрофон не нужен приложению вообще, но нужен автослушанию жёстко — на
    // «необязателен» пользователь и пропускал его, а потом режим не поднимался.
    expect(row(MICROPHONE_ROW).getByText(NEEDS["auto-mode"])).not.toBeNull();
    expect(row(SYSTEM_AUDIO_ROW).getByText(NEEDS.launch)).not.toBeNull();
    expect(row(SCREEN_ROW).getByText(NEEDS.optional)).not.toBeNull();
  });

  it("«Выдать» запрашивает именно тот доступ, у строки которого нажали", () => {
    const permissions = api({ audio: "unknown", screen: "unknown", microphone: "unknown" });
    render(<PermissionsScreen permissions={permissions} />);
    fireEvent.click(row(SCREEN_ROW).getByText(BUTTONS.grant));
    expect(permissions.request).toHaveBeenCalledExactlyOnceWith("screen");
  });

  it("«Выдать» у микрофона запрашивает именно микрофон", () => {
    const permissions = api({ audio: "granted", screen: "granted", microphone: "unknown" });
    render(<PermissionsScreen permissions={permissions} />);
    fireEvent.click(row(MICROPHONE_ROW).getByText(BUTTONS.grant));
    expect(permissions.request).toHaveBeenCalledExactlyOnceWith("microphone");
  });

  it("у выданного доступа кнопок запроса нет", () => {
    render(
      <PermissionsScreen
        permissions={api({ audio: "granted", screen: "granted", microphone: "granted" })}
      />,
    );
    expect(screen.queryByText(BUTTONS.grant)).toBeNull();
    expect(screen.queryByText(BUTTONS.openSettings)).toBeNull();
  });

  it("у отклонённого доступа остаются обе кнопки: повтор и системные настройки", () => {
    const permissions = api({ audio: "denied", screen: "granted", microphone: "granted" });
    render(<PermissionsScreen permissions={permissions} />);
    fireEvent.click(row(SYSTEM_AUDIO_ROW).getByText(BUTTONS.openSettings));
    expect(permissions.openSettings).toHaveBeenCalledExactlyOnceWith("audio");
    fireEvent.click(row(SYSTEM_AUDIO_ROW).getByText(BUTTONS.grant));
    expect(permissions.request).toHaveBeenCalledExactlyOnceWith("audio");
  });

  it("во время запроса нажатая кнопка говорит «Запрашиваю…», обе заблокированы", () => {
    const permissions = api(
      { audio: "unknown", screen: "unknown", microphone: "granted" },
      { pending: "audio" },
    );
    render(<PermissionsScreen permissions={permissions} />);
    const requesting = row(SYSTEM_AUDIO_ROW)
      .getByText<HTMLButtonElement>(BUTTONS.requesting)
      .closest("button");
    const idle = row(SCREEN_ROW).getByText<HTMLButtonElement>(BUTTONS.grant).closest("button");
    if (!requesting || !idle) throw new Error("нет кнопок запроса доступа");
    expect(requesting.disabled).toBe(true);
    expect(idle.disabled).toBe(true);
  });

  it("«Проверить заново» перечитывает статусы", () => {
    const permissions = api({ audio: "denied", screen: "denied", microphone: "denied" });
    render(<PermissionsScreen permissions={permissions} />);
    fireEvent.click(screen.getByText(getDict().launcher.permissions.recheck));
    expect(permissions.refresh).toHaveBeenCalledTimes(1);
  });
});
