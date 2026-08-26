import { describe, expect, it } from "vitest";
import {
  isNearBottom,
  jumpButtonVisible,
  NEAR_BOTTOM_PX,
  shouldScrollToBottom,
  type ScrollMetrics,
} from "./chat-scroll";
import type { ChatMessage } from "./chats";

function metrics(scrollTop: number, scrollHeight: number, clientHeight: number): ScrollMetrics {
  return { scrollTop, scrollHeight, clientHeight };
}

function user(text: string): ChatMessage {
  return { role: "user", text, images: [] };
}

function assistant(text: string): ChatMessage {
  return { role: "assistant", text, images: [] };
}

describe("isNearBottom", () => {
  it("низ есть низ", () => {
    expect(isNearBottom(metrics(800, 1000, 200))).toBe(true);
  });

  it("в пределах порога — всё ещё низ", () => {
    expect(isNearBottom(metrics(800 - (NEAR_BOTTOM_PX - 1), 1000, 200))).toBe(true);
  });

  it("ровно на пороге — уже не низ", () => {
    expect(isNearBottom(metrics(800 - NEAR_BOTTOM_PX, 1000, 200))).toBe(false);
  });

  it("самый верх длинной истории — не низ", () => {
    expect(isNearBottom(metrics(0, 1000, 200))).toBe(false);
  });
});

describe("jumpButtonVisible", () => {
  it("кнопка не нужна, пока история помещается целиком", () => {
    expect(jumpButtonVisible(metrics(0, 200, 200))).toBe(false);
  });

  it("кнопка не нужна, когда уже внизу", () => {
    expect(jumpButtonVisible(metrics(800, 1000, 200))).toBe(false);
  });

  it("кнопка нужна, когда есть куда идти и мы не там", () => {
    expect(jumpButtonVisible(metrics(0, 1000, 200))).toBe(true);
  });
});

describe("shouldScrollToBottom", () => {
  it("своё сообщение доскроллит вниз", () => {
    expect(shouldScrollToBottom([], [user("вопрос")])).toBe(true);
  });

  // Ответ дописывается в конце стрима: к этому моменту он уже давно на экране,
  // и читатель может быть где угодно внутри него.
  it("дописанный ответ ассистента не двигает скролл", () => {
    const before = [user("вопрос")];
    expect(shouldScrollToBottom(before, [...before, assistant("ответ")])).toBe(false);
  });

  it("история той же длины ничего не двигает", () => {
    const same = [user("вопрос")];
    expect(shouldScrollToBottom(same, same)).toBe(false);
  });

  it("удаление сообщения ничего не двигает", () => {
    const before = [user("первый"), assistant("ответ"), user("второй")];
    expect(shouldScrollToBottom(before, before.slice(0, 2))).toBe(false);
  });

  // Переотправка режет историю по своему сообщению: длина падает, значит это
  // не «я только что написал», и позиция остаётся за читателем.
  it("обрезка истории по своему сообщению не считается отправкой", () => {
    const before = [user("первый"), assistant("ответ"), user("второй")];
    expect(shouldScrollToBottom(before, [user("первый")])).toBe(false);
  });
});
