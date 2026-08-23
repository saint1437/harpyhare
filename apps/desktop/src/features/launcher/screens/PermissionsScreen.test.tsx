import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PermissionsApi } from "@/hooks/usePermissions";
import type { PermissionsStatus } from "@/ipc/bindings";
import { PermissionsScreen } from "./PermissionsScreen";

const SYSTEM_AUDIO_ROW = "Запись системного звука";
const MICROPHONE_ROW = "Микрофон";
const SCREEN_ROW = "Запись экрана";

function api(status: PermissionsStatus, overrides: Partial<PermissionsApi> = {}): PermissionsApi {
  return {
    status,
    loaded: true,
    audioOk: status.audio === "granted",
    screenOk: status.screen === "granted",
    microphoneOk: status.microphone === "granted",
    allOk: status.audio === "granted" && status.screen === "granted",
    needsAttention: status.audio !== "granted" || status.screen === "unknown",
    pending: null,
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
    expect(row(SYSTEM_AUDIO_ROW).getByText("выдан")).not.toBeNull();
    expect(row(SCREEN_ROW).getByText("не выдан")).not.toBeNull();
    expect(row(MICROPHONE_ROW).getByText("нет доступа")).not.toBeNull();
  });

  it("микрофон показан необязательным доступом", () => {
    render(
      <PermissionsScreen
        permissions={api({ audio: "granted", screen: "granted", microphone: "unknown" })}
      />,
    );
    expect(row(MICROPHONE_ROW).getByText("необязателен")).not.toBeNull();
    expect(row(SYSTEM_AUDIO_ROW).getByText("обязателен")).not.toBeNull();
  });

  it("«Выдать» запрашивает именно тот доступ, у строки которого нажали", () => {
    const permissions = api({ audio: "unknown", screen: "unknown", microphone: "unknown" });
    render(<PermissionsScreen permissions={permissions} />);
    fireEvent.click(row(SCREEN_ROW).getByText("Выдать"));
    expect(permissions.request).toHaveBeenCalledExactlyOnceWith("screen");
  });

  it("«Выдать» у микрофона запрашивает именно микрофон", () => {
    const permissions = api({ audio: "granted", screen: "granted", microphone: "unknown" });
    render(<PermissionsScreen permissions={permissions} />);
    fireEvent.click(row(MICROPHONE_ROW).getByText("Выдать"));
    expect(permissions.request).toHaveBeenCalledExactlyOnceWith("microphone");
  });

  it("у выданного доступа кнопок запроса нет", () => {
    render(
      <PermissionsScreen
        permissions={api({ audio: "granted", screen: "granted", microphone: "granted" })}
      />,
    );
    expect(screen.queryByText("Выдать")).toBeNull();
    expect(screen.queryByText("Настройки")).toBeNull();
  });

  it("у отклонённого доступа остаются обе кнопки: повтор и системные настройки", () => {
    const permissions = api({ audio: "denied", screen: "granted", microphone: "granted" });
    render(<PermissionsScreen permissions={permissions} />);
    fireEvent.click(row(SYSTEM_AUDIO_ROW).getByText("Настройки"));
    expect(permissions.openSettings).toHaveBeenCalledExactlyOnceWith("audio");
    fireEvent.click(row(SYSTEM_AUDIO_ROW).getByText("Выдать"));
    expect(permissions.request).toHaveBeenCalledExactlyOnceWith("audio");
  });

  it("во время запроса нажатая кнопка говорит «Запрашиваю…», обе заблокированы", () => {
    const permissions = api(
      { audio: "unknown", screen: "unknown", microphone: "granted" },
      { pending: "audio" },
    );
    render(<PermissionsScreen permissions={permissions} />);
    const requesting = row(SYSTEM_AUDIO_ROW)
      .getByText<HTMLButtonElement>("Запрашиваю…")
      .closest("button");
    const idle = row(SCREEN_ROW).getByText<HTMLButtonElement>("Выдать").closest("button");
    if (!requesting || !idle) throw new Error("нет кнопок запроса доступа");
    expect(requesting.disabled).toBe(true);
    expect(idle.disabled).toBe(true);
  });

  it("«Проверить заново» перечитывает статусы", () => {
    const permissions = api({ audio: "denied", screen: "denied", microphone: "denied" });
    render(<PermissionsScreen permissions={permissions} />);
    fireEvent.click(screen.getByText("Проверить заново"));
    expect(permissions.refresh).toHaveBeenCalledTimes(1);
  });
});
