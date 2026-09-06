import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { listAudioInputDevices, listAudioOutputDevices } from "@/ipc/commands";
import { DEFAULT_SETTINGS, type Settings } from "@/ipc/types";
import { createQueryClient } from "@/lib/query-client";
import { SttSection } from "./SttSection";

vi.mock("@/ipc/commands", () => ({
  listAudioInputDevices: vi.fn(),
  listAudioOutputDevices: vi.fn(),
}));

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  globalThis.ResizeObserver = class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  };
});

beforeEach(() => {
  vi.mocked(listAudioOutputDevices).mockResolvedValue([{ uid: "speakers", name: "Speakers" }]);
  vi.mocked(listAudioInputDevices).mockResolvedValue([
    { uid: "usb-mic", name: "USB Microphone" },
    { uid: "headset-mic", name: "Headset Microphone" },
  ]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderSection(overrides: Partial<Settings> = {}) {
  const set = vi.fn();
  const client = createQueryClient();
  render(
    <QueryClientProvider client={client}>
      <SttSection draft={{ ...DEFAULT_SETTINGS, ...overrides }} set={set} />
    </QueryClientProvider>,
  );
  return set;
}

async function openDeviceSelect(label: string) {
  await waitFor(() => {
    expect(listAudioInputDevices).toHaveBeenCalledOnce();
    expect(listAudioOutputDevices).toHaveBeenCalledOnce();
  });
  fireEvent.keyDown(screen.getByRole("combobox", { name: label }), { key: "ArrowDown" });
}

describe("выбор устройств захвата", () => {
  it("выбирает микрофон независимо от динамиков и не смешивает списки", async () => {
    const set = renderSection({ capture_device_uid: "speakers" });
    await openDeviceSelect("Микрофон для захвата");
    const option = await screen.findByRole("option", { name: "USB Microphone" });
    expect(screen.queryByRole("option", { name: "Speakers" })).toBeNull();
    fireEvent.click(option);
    expect(set).toHaveBeenCalledExactlyOnceWith("microphone_device_uid", "usb-mic");
  });

  it("возвращает микрофон к системному устройству по умолчанию", async () => {
    const set = renderSection({ microphone_device_uid: "usb-mic" });
    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: "Микрофон для захвата" }).textContent).toContain(
        "USB Microphone",
      );
    });
    await openDeviceSelect("Микрофон для захвата");
    fireEvent.click(await screen.findByRole("option", { name: "Микрофон по умолчанию" }));
    expect(set).toHaveBeenCalledExactlyOnceWith("microphone_device_uid", "");
  });

  it("сохраняет UID отключённого микрофона и показывает недоступность", async () => {
    const set = renderSection({ microphone_device_uid: "disconnected" });
    await openDeviceSelect("Микрофон для захвата");
    expect(await screen.findByRole("option", { name: "Недоступное устройство" })).toBeTruthy();
    expect(set).not.toHaveBeenCalled();
  });

  it("оставляет системный микрофон доступным при пустом списке", async () => {
    vi.mocked(listAudioInputDevices).mockResolvedValue([]);
    renderSection();
    await openDeviceSelect("Микрофон для захвата");
    expect(await screen.findByRole("option", { name: "Микрофон по умолчанию" })).toBeTruthy();
    expect(within(screen.getByRole("listbox")).getAllByRole("option")).toHaveLength(1);
  });

  it("не меняет выбор микрофона при переключении динамиков", async () => {
    const set = renderSection({ microphone_device_uid: "usb-mic" });
    await openDeviceSelect("Устройство захвата");
    fireEvent.click(await screen.findByRole("option", { name: "Speakers" }));
    expect(screen.queryByRole("option", { name: "USB Microphone" })).toBeNull();
    expect(set).toHaveBeenCalledExactlyOnceWith("capture_device_uid", "speakers");
  });

  it("показывает ошибку загрузки, не сбрасывая сохранённый микрофон", async () => {
    vi.mocked(listAudioInputDevices).mockRejectedValue(new Error("device enumeration failed"));
    const set = renderSection({ microphone_device_uid: "usb-mic" });
    expect(await screen.findByText(/Не удалось загрузить устройства/)).toBeTruthy();
    expect(set).not.toHaveBeenCalled();
  });
});
