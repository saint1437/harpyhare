import { describe, expect, it } from "vitest";
import type { AppError } from "./errors";
import { errorToastContent } from "./notify";

function err(code: AppError["code"], message = "подробности"): AppError {
  return { code, message };
}

describe("errorToastContent", () => {
  it("сеть и отмена не дают тост — сеть закрывает оверлей, отмена не ошибка", () => {
    expect(errorToastContent(err("network"))).toBeNull();
    expect(errorToastContent(err("cancelled"))).toBeNull();
  });

  it("остальные коды получают заголовок и исходное сообщение", () => {
    expect(errorToastContent(err("badApiKey", "Неверный ключ Anthropic"))).toEqual({
      title: "Неверный ключ",
      message: "Неверный ключ Anthropic",
    });
    expect(errorToastContent(err("api", "HTTP 500"))?.title).toBe("Ошибка API");
    expect(errorToastContent(err("silence"))?.title).toBe("Речь не распознана");
    expect(errorToastContent(err("internal"))?.title).toBe("Ошибка");
  });
});
