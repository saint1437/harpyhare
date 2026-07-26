import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PermissionsApi } from "@/hooks/usePermissions";
import type { PermissionsStatus } from "@/ipc/bindings";
import { PermissionsScreen } from "./PermissionsScreen";

function api(status: PermissionsStatus, overrides: Partial<PermissionsApi> = {}): PermissionsApi {
  return {
    status,
    loaded: true,
    audioOk: status.audio === "granted",
    screenOk: status.screen === "granted",
    allOk: status.audio === "granted" && status.screen === "granted",
    needsAttention: status.audio !== "granted" || status.screen === "unknown",
    pending: null,
    request: vi.fn(() => Promise.resolve()),
    openSettings: vi.fn(),
    refresh: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PermissionsScreen", () => {
  it("собирает все доступы в одном месте со статусами", () => {
    render(<PermissionsScreen permissions={api({ audio: "granted", screen: "unknown" })} />);
    expect(screen.getByText("Запись системного звука")).not.toBeNull();
    expect(screen.getByText("Запись экрана")).not.toBeNull();
    expect(screen.getByText("выдан")).not.toBeNull();
    expect(screen.getByText("не выдан")).not.toBeNull();
  });

  it("«Выдать» запрашивает именно тот доступ, у строки которого нажали", () => {
    const permissions = api({ audio: "unknown", screen: "unknown" });
    render(<PermissionsScreen permissions={permissions} />);
    const [, screenGrant] = screen.getAllByText("Выдать");
    if (!screenGrant) throw new Error("нет кнопки «Выдать» у строки записи экрана");
    fireEvent.click(screenGrant);
    expect(permissions.request).toHaveBeenCalledWith("screen");
  });

  it("у выданного доступа кнопок запроса нет", () => {
    render(<PermissionsScreen permissions={api({ audio: "granted", screen: "granted" })} />);
    expect(screen.queryByText("Выдать")).toBeNull();
    expect(screen.queryByText("Настройки")).toBeNull();
  });

  it("у отклонённого доступа остаются обе кнопки: повтор и системные настройки", () => {
    const permissions = api({ audio: "denied", screen: "granted" });
    render(<PermissionsScreen permissions={permissions} />);
    fireEvent.click(screen.getByText("Настройки"));
    expect(permissions.openSettings).toHaveBeenCalledWith("audio");
    fireEvent.click(screen.getByText("Выдать"));
    expect(permissions.request).toHaveBeenCalledWith("audio");
  });

  it("набор кнопок не зависит от того, идёт ли запрос — меняется только их доступность", () => {
    const permissions = api({ audio: "unknown", screen: "unknown" }, { pending: "audio" });
    render(<PermissionsScreen permissions={permissions} />);
    const grants = screen.getAllByText<HTMLButtonElement>("Выдать");
    expect(grants).toHaveLength(2);
    expect(grants.every((b) => b.disabled)).toBe(true);
  });

  it("«Проверить заново» перечитывает статусы", () => {
    const permissions = api({ audio: "denied", screen: "denied" });
    render(<PermissionsScreen permissions={permissions} />);
    fireEvent.click(screen.getByText("Проверить заново"));
    expect(permissions.refresh).toHaveBeenCalledTimes(1);
  });
});
