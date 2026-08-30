import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn<(command: string, args: unknown) => Promise<unknown>>();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (command: string, args: unknown) => invoke(command, args),
}));

import { redeemAccessCode } from "./commands";

function idempotencyKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith("redeem-idem:")) keys.push(key);
  }
  return keys;
}

beforeEach(() => {
  invoke.mockReset();
  localStorage.clear();
});

describe("redeemAccessCode (режим Tauri)", () => {
  it("нормализует код и передаёт idempotency-ключ в команду", async () => {
    invoke.mockResolvedValue(undefined);
    const error = await redeemAccessCode("ms24h-9dmrw-40jdh-ztj9x");
    expect(error).toBeNull();
    const [command, args] = invoke.mock.calls[0] as [
      string,
      { code: string; idempotencyKey: string },
    ];
    expect(command).toBe("redeem_access_code");
    expect(args.code).toBe("MS24H9DMRW40JDHZTJ9X");
    expect(typeof args.idempotencyKey).toBe("string");
    expect(args.idempotencyKey.length).toBeGreaterThan(0);
  });

  it("успех очищает idempotency-ключ из localStorage", async () => {
    invoke.mockResolvedValue(undefined);
    await redeemAccessCode("AAAAA-BBBBB");
    expect(idempotencyKeys()).toEqual([]);
  });

  it("не хранит сам код в ключе localStorage (только хэш)", async () => {
    invoke.mockRejectedValue("нет");
    await redeemAccessCode("SECRET-CODE0");
    const keys = idempotencyKeys();
    expect(keys).toHaveLength(1);
    expect(keys[0]).not.toContain("SECRET");
  });

  it("ошибка возвращает сообщение и сохраняет ключ для повторной попытки", async () => {
    invoke.mockRejectedValueOnce("Код недействителен или уже использован");
    const first = await redeemAccessCode("bad-code0");
    expect(first).toBe("Код недействителен или уже использован");
    const [firstKey] = idempotencyKeys();
    if (firstKey === undefined) throw new Error("ожидался сохранённый idempotency-ключ");
    const reusedKey = localStorage.getItem(firstKey);

    invoke.mockResolvedValueOnce(undefined);
    await redeemAccessCode("bad-code0");
    expect(invoke).toHaveBeenLastCalledWith("redeem_access_code", {
      code: "BADC0DE0",
      idempotencyKey: reusedKey,
    });
  });
});
