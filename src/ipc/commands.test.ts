import { describe, expect, it } from "vitest";
import { captureAvailable, getSettings, moveWindowBy, sendToClaude } from "./commands";
import { DEFAULT_SETTINGS } from "./types";

// jsdom — не Tauri (нет __TAURI_INTERNALS__) → команды-заглушки безопасны.
describe("commands в браузерном режиме", () => {
  it("getSettings отдаёт дефолты", async () => {
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
  });
  it("captureAvailable → true (нет баннера в превью)", async () => {
    expect(await captureAvailable()).toBe(true);
  });
  it("мутации не бросают и резолвятся в undefined", async () => {
    await expect(
      sendToClaude([{ role: "user", text: "hi", images: [] }], "chat-1", ""),
    ).resolves.toBeUndefined();
    await expect(moveWindowBy(10, 0)).resolves.toBeUndefined();
  });
});
