import { describe, expect, it, vi } from "vitest";
import { createSaveQueue } from "./save-queue";

describe("createSaveQueue", () => {
  it("оставляет снимок для повторной записи после ошибки", async () => {
    const write = vi
      .fn<(value: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error("disk full"))
      .mockResolvedValueOnce(undefined);
    const queue = createSaveQueue(write);
    queue.stage("важные данные");

    await expect(queue.flush()).rejects.toThrow("disk full");
    await queue.flush();

    expect(write).toHaveBeenNthCalledWith(2, "важные данные");
  });

  it("последний снимок не теряется, пока идёт предыдущая запись", async () => {
    let release!: () => void;
    const write = vi.fn<(value: string) => Promise<void>>((value) =>
      value === "first"
        ? new Promise<void>((resolve) => {
            release = resolve;
          })
        : Promise.resolve(),
    );
    const queue = createSaveQueue(write);
    queue.stage("first");
    const first = queue.flush();
    queue.stage("second");
    release();
    await first;

    expect(write).toHaveBeenNthCalledWith(2, "second");
  });
});
