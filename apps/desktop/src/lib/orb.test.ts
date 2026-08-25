import { describe, expect, it } from "vitest";
import type { RecorderState } from "@/ipc/types";
import { orbState } from "./orb";

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
