import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UpdateInfo } from "@/ipc/types";

type Handler = (payload: unknown) => void;
const handlers = new Map<string, Handler>();
const checkForUpdate = vi.fn<() => Promise<UpdateInfo | null>>();
const installUpdate = vi.fn<() => Promise<void>>();
const getAppVersion = vi.fn<() => Promise<string>>();

vi.mock("@/ipc/events", () => ({
  onEvent: (name: string, handler: Handler) => {
    handlers.set(name, handler);
    return () => {
      handlers.delete(name);
    };
  },
}));
vi.mock("@/ipc/commands", () => ({
  checkForUpdate: () => checkForUpdate(),
  installUpdate: () => installUpdate(),
  getAppVersion: () => getAppVersion(),
}));

import { useUpdater } from "./useUpdater";

function emit(name: string, payload: unknown) {
  act(() => handlers.get(name)?.(payload));
}

const INFO: UpdateInfo = { version: "0.2.0", notes: "Заметки", date: null };

afterEach(() => {
  handlers.clear();
  vi.clearAllMocks();
});

describe("useUpdater", () => {
  it("отдаёт версию сборки и статус available по событию", async () => {
    getAppVersion.mockResolvedValue("0.1.0");
    const { result } = renderHook(() => useUpdater());
    expect(result.current.status).toBe("idle");
    await waitFor(() => {
      expect(result.current.currentVersion).toBe("0.1.0");
    });
    emit("update-available", INFO);
    expect(result.current.status).toBe("available");
    expect(result.current.info).toEqual(INFO);
  });

  it("install: downloading → прогресс → restarting по update-done", async () => {
    getAppVersion.mockResolvedValue("0.1.0");
    let resolveInstall: () => void = () => {
      /* переопределяется исполнителем промиса ниже */
    };
    installUpdate.mockReturnValue(
      new Promise((r) => {
        resolveInstall = r;
      }),
    );
    const { result } = renderHook(() => useUpdater());
    emit("update-available", INFO);
    act(() => {
      result.current.install();
    });
    expect(result.current.status).toBe("downloading");
    emit("update-progress", { downloaded: 512, total: 1024 });
    expect(result.current.progress).toEqual({ downloaded: 512, total: 1024 });
    emit("update-done", { version: "0.2.0" });
    expect(result.current.status).toBe("restarting");
    // событие от периодической автопроверки не сбивает установку
    emit("update-available", INFO);
    expect(result.current.status).toBe("restarting");
    resolveInstall();
    await act(async () => {
      await Promise.resolve(); // дать зарезолвленному install-промису отработать
    });
  });

  it("реджект install_update → статус error с текстом", async () => {
    getAppVersion.mockResolvedValue("0.1.0");
    installUpdate.mockRejectedValue("сеть недоступна");
    const { result } = renderHook(() => useUpdater());
    emit("update-available", INFO);
    act(() => {
      result.current.install();
    });
    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });
    expect(result.current.error).toContain("сеть недоступна");
    expect(result.current.info).toEqual(INFO); // остаётся для «Повторить»
  });

  it("checkNow: null — статус не меняется; найдено — available", async () => {
    getAppVersion.mockResolvedValue("0.1.0");
    checkForUpdate.mockResolvedValue(null);
    const { result } = renderHook(() => useUpdater());
    await act(async () => {
      await expect(result.current.checkNow()).resolves.toBeNull();
    });
    expect(result.current.status).toBe("idle");
    checkForUpdate.mockResolvedValue(INFO);
    await act(async () => {
      await expect(result.current.checkNow()).resolves.toEqual(INFO);
    });
    expect(result.current.status).toBe("available");
  });

  it("dismiss сбрасывает найденное обновление (после «Пропустить»)", () => {
    getAppVersion.mockResolvedValue("0.1.0");
    const { result } = renderHook(() => useUpdater());
    emit("update-available", INFO);
    act(() => {
      result.current.dismiss();
    });
    expect(result.current.status).toBe("idle");
    expect(result.current.info).toBeNull();
  });
});
