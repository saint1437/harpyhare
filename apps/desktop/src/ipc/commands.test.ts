import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn<(command: string, args?: unknown) => Promise<unknown>>();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (command: string, args?: unknown) => invoke(command, args),
}));

const startDragging = vi.fn<() => Promise<void>>(() => Promise.resolve());
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ startDragging: () => startDragging() }),
}));

import {
  captureAvailable,
  getSettings,
  moveWindowBy,
  probeConnectivity,
  sendToClaude,
  startWindowDrag,
} from "./commands";

beforeEach(() => {
  invoke.mockReset();
  startDragging.mockClear();
});

describe("commands (Tauri IPC)", () => {
  it("getSettings проксирует invoke('get_settings') и отдаёт результат", async () => {
    const settings = { theme: "gray" };
    invoke.mockResolvedValue(settings);
    expect(await getSettings()).toBe(settings);
    expect(invoke).toHaveBeenCalledWith("get_settings", undefined);
  });

  it("captureAvailable проксирует invoke('capture_available')", async () => {
    invoke.mockResolvedValue(true);
    expect(await captureAvailable()).toBe(true);
    expect(invoke).toHaveBeenCalledWith("capture_available", undefined);
  });

  it("probeConnectivity проксирует invoke('probe_connectivity')", async () => {
    invoke.mockResolvedValue(false);
    expect(await probeConnectivity()).toBe(false);
    expect(invoke).toHaveBeenCalledWith("probe_connectivity", undefined);
  });

  it("sendToClaude передаёт camelCase-аргументы", async () => {
    invoke.mockResolvedValue(undefined);
    await sendToClaude(
      [{ role: "user", text: "hi", images: [] }],
      "chat-1",
      "sys",
      true,
      "claude-opus-4-8",
      false,
    );
    expect(invoke).toHaveBeenCalledWith("send_to_claude", {
      messages: [{ role: "user", text: "hi", images: [] }],
      chatId: "chat-1",
      system: "sys",
      thinking: true,
      model: "claude-opus-4-8",
      webSearch: false,
    });
  });

  it("moveWindowBy → move_window_by {dx,dy}", async () => {
    invoke.mockResolvedValue(undefined);
    await moveWindowBy(10, -5);
    expect(invoke).toHaveBeenCalledWith("move_window_by", { dx: 10, dy: -5 });
  });

  it("startWindowDrag дёргает getCurrentWindow().startDragging()", async () => {
    await startWindowDrag();
    expect(startDragging).toHaveBeenCalledOnce();
  });
});
