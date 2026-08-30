import { describe, expect, it } from "vitest";
import { internalError, isNetworkError, isRetryable, type AppError } from "./errors";

const err = (code: AppError["code"]): AppError => ({ code, message: "текст" });

describe("isRetryable", () => {
  it("предлагает повтор для сети и перегрузки провайдера", () => {
    expect(isRetryable(err("network"))).toBe(true);
    expect(isRetryable(err("retryable"))).toBe(true);
  });

  it("не предлагает повтор для смысловых отказов", () => {
    expect(isRetryable(err("badApiKey"))).toBe(false);
    expect(isRetryable(err("badAccessCode"))).toBe(false);
    expect(isRetryable(err("silence"))).toBe(false);
    expect(isRetryable(err("permission"))).toBe(false);
    expect(isRetryable(null)).toBe(false);
  });
});

describe("isNetworkError", () => {
  it("отделяет обрыв связи от прочих ошибок", () => {
    expect(isNetworkError(err("network"))).toBe(true);
    expect(isNetworkError(err("retryable"))).toBe(false);
    expect(isNetworkError(null)).toBe(false);
  });
});

describe("internalError", () => {
  it("заворачивает произвольный текст во внутренний код", () => {
    expect(internalError("сломалось")).toEqual({ code: "internal", message: "сломалось" });
  });
});
