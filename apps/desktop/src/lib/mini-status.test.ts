import { describe, expect, it } from "vitest";
import { isActivityStatus, miniStatus } from "./mini-status";

describe("miniStatus — приоритет статусов мини-режима", () => {
  it("запись старше всего: свёрнутое окно обязано отвечать «меня сейчас слышно?»", () => {
    expect(miniStatus("recording", true, true, true)).toBe("recording");
  });

  it("расшифровка старше стрима, ошибки и непрочитанного ответа", () => {
    expect(miniStatus("transcribing", true, true, true)).toBe("transcribing");
  });

  it("идущий ответ старше ошибки и непрочитанного", () => {
    expect(miniStatus("idle", true, true, true)).toBe("streaming");
  });

  it("ошибка старше непрочитанного ответа", () => {
    expect(miniStatus("idle", false, true, true)).toBe("error");
  });

  it("непрочитанный ответ старше тишины", () => {
    expect(miniStatus("idle", false, false, true)).toBe("unread");
  });

  it("без событий — тишина", () => {
    expect(miniStatus("idle", false, false, false)).toBe("idle");
  });
});

describe("isActivityStatus", () => {
  it("рамка горит на записи, расшифровке и стриме", () => {
    expect(isActivityStatus("recording", false)).toBe(true);
    expect(isActivityStatus("transcribing", false)).toBe(true);
    expect(isActivityStatus("idle", true)).toBe(true);
  });

  it("в покое рамки нет", () => {
    expect(isActivityStatus("idle", false)).toBe(false);
  });
});
