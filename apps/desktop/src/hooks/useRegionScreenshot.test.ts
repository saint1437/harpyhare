import { act, renderHook } from "@testing-library/react";
import { emitIpcEvent, resetIpcEventHandlers } from "@/test-utils/fake-ipc-events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getDict } from "@/i18n";
import { errorTitle } from "@/i18n/errors";
import type { AppError } from "@/lib/errors";
import { dismissAllNotifications, getNotifications } from "@/lib/notifications";

const captureRegionScreenshot = vi.fn<() => Promise<void>>(() => Promise.resolve());

vi.mock("@/ipc/events", async () => await import("@/test-utils/fake-ipc-events"));
vi.mock("@/ipc/commands", () => ({
  captureRegionScreenshot: () => captureRegionScreenshot(),
}));

import { useRegionScreenshot } from "./useRegionScreenshot";

const PERMISSION_ERROR: AppError = { code: "permission", message: "Нет разрешения" };

afterEach(() => {
  resetIpcEventHandlers();
  dismissAllNotifications();
  vi.clearAllMocks();
});

describe("useRegionScreenshot", () => {
  // Событие несёт ССЫЛКУ в хранилище картинок, а не сам снимок: файл уже
  // записан бэкендом, и хук передаёт дальше id, а не собранный data URL.
  it("отдаёт в колбэк ссылку из payload события", () => {
    const onImage = vi.fn();
    renderHook(() => useRegionScreenshot(onImage));
    emitIpcEvent("screenshot-ready", { id: "00000000000000aa.png", mediaType: "image/png" });
    expect(onImage).toHaveBeenCalledWith("00000000000000aa.png", "image/png");
  });

  // Хук больше не хранит отказ: снимок области — разовое действие, и его
  // неудача целиком помещается в уведомление.
  it("ошибка события уходит в уведомление заголовком по коду", () => {
    renderHook(() => useRegionScreenshot(vi.fn()));
    emitIpcEvent("screenshot-error", PERMISSION_ERROR);
    expect(getNotifications()).toHaveLength(1);
    expect(getNotifications()[0]?.title).toBe(errorTitle("permission", getDict()));
    expect(getNotifications()[0]?.detail).toBe(PERMISSION_ERROR.message);
    expect(getNotifications()[0]?.tone).toBe("danger");
  });

  it("capture дёргает команду", () => {
    const { result } = renderHook(() => useRegionScreenshot(vi.fn()));
    act(() => {
      result.current.capture();
    });
    expect(captureRegionScreenshot).toHaveBeenCalledTimes(1);
  });
});
