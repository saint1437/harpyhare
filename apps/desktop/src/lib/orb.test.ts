import { describe, expect, it } from "vitest";
import type { RecorderState } from "@/ipc/types";
import { answerArrival, orbState } from "./orb";

const base = {
  state: "idle" as RecorderState,
  autoListening: false,
  bufferEnabled: false,
  hasError: false,
  streaming: false,
  answerReady: false,
};

describe("orbState", () => {
  // Единственный вопрос, на который свёрнутое окно не имеет права ответить
  // неверно: пишется ли звук прямо сейчас. Поэтому захват старше всего
  // остального — и готового ответа, и ошибки.
  it("захват старше готового ответа и ошибки", () => {
    expect(orbState({ ...base, state: "recording", answerReady: true })).toBe("recording");
    expect(orbState({ ...base, autoListening: true, hasError: true })).toBe("auto");
    expect(orbState({ ...base, state: "transcribing", answerReady: true })).toBe("transcribing");
  });

  it("дописанный ответ зовёт обратно, когда захвата нет", () => {
    expect(orbState({ ...base, answerReady: true })).toBe("answer");
    expect(orbState({ ...base, answerReady: true, bufferEnabled: true })).toBe("answer");
  });

  it("поток ответа показывается как работа", () => {
    expect(orbState({ ...base, streaming: true })).toBe("transcribing");
  });

  it("в покое клубок честно говорит, слушает он или нет", () => {
    expect(orbState({ ...base, bufferEnabled: true })).toBe("armed");
    expect(orbState(base)).toBe("off");
    expect(orbState({ ...base, hasError: true })).toBe("error");
  });
});

describe("answerArrival", () => {
  const base = { collapsed: true, chatId: "a", activeChatId: "a" };

  it("дописанный ответ в активном чате разворачивает окно", () => {
    expect(answerArrival(base)).toBe("expand");
  });

  // Чаты идут параллельно: развернуться на чат, где ничего не изменилось,
  // значит соврать. Такой ответ зовёт точкой и ждёт переключения.
  it("ответ в фоновом чате только зовёт точкой", () => {
    expect(answerArrival({ ...base, chatId: "b" })).toBe("notify");
  });

  it("развёрнутое окно ничего не делает", () => {
    expect(answerArrival({ ...base, collapsed: false })).toBe("ignore");
    expect(answerArrival({ ...base, collapsed: false, chatId: "b" })).toBe("ignore");
  });
});
