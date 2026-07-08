import { describe, expect, it } from "vitest";
import {
  captureAvailable,
  getSettings,
  moveWindowBy,
  sendToClaude,
  startWindowDrag,
} from "./commands";
import { DEFAULT_SETTINGS } from "./types";

describe("commands в браузерном режиме", () => {
  it("getSettings отдаёт дефолты", async () => {
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
  });
  it("captureAvailable → true (нет баннера в превью)", async () => {
    expect(await captureAvailable()).toBe(true);
  });
  it("мутации не бросают и резолвятся в undefined", async () => {
    await expect(
      sendToClaude(
        [{ role: "user", text: "hi", images: [] }],
        "chat-1",
        "",
        true,
        "claude-opus-4-8",
        false,
      ),
    ).resolves.toBeUndefined();
    await expect(moveWindowBy(10, 0)).resolves.toBeUndefined();
    await expect(startWindowDrag()).resolves.toBeUndefined();
  });
});
