import { describe, expect, it } from "vitest";
import type { AutoTurn } from "@/ipc/types";
import {
  insertTurn,
  NO_TURN_SUBMITTED,
  planDispatch,
  planManualSubmission,
  planSubmission,
  renderTurns,
  turnsAfter,
} from "./auto-turns";

function turn(seq: number, speaker: AutoTurn["speaker"], text: string): AutoTurn {
  return { seq, speaker, text };
}

describe("insertTurn", () => {
  it("держит очередь упорядоченной по seq, когда реплики приходят вразнобой", () => {
    const out = [turn(2, "user", "b"), turn(0, "interviewer", "a"), turn(1, "user", "c")].reduce<
      AutoTurn[]
    >(insertTurn, []);
    expect(out.map((t) => t.seq)).toEqual([0, 1, 2]);
  });

  it("игнорирует повтор той же реплики", () => {
    const first = insertTurn([], turn(0, "interviewer", "вопрос"));
    expect(insertTurn(first, turn(0, "interviewer", "вопрос"))).toBe(first);
  });

  it("не теряет реплику, пришедшую позже всех", () => {
    const out = insertTurn([turn(0, "interviewer", "a")], turn(5, "user", "b"));
    expect(out.map((t) => t.seq)).toEqual([0, 5]);
  });
});

describe("turnsAfter", () => {
  it("отдаёт только неотправленные реплики", () => {
    const turns = [turn(0, "interviewer", "a"), turn(1, "user", "b"), turn(2, "interviewer", "c")];
    expect(turnsAfter(turns, 0).map((t) => t.seq)).toEqual([1, 2]);
    expect(turnsAfter(turns, NO_TURN_SUBMITTED)).toHaveLength(3);
  });
});

describe("renderTurns", () => {
  it("без реплик пользователя отдаёт чистый текст без подписей", () => {
    const text = renderTurns([turn(0, "interviewer", "Что такое"), turn(1, "interviewer", "GC?")]);
    expect(text).toBe("Что такое GC?");
  });

  it("подписывает обе стороны, когда в окне есть ответ пользователя", () => {
    const text = renderTurns([
      turn(0, "interviewer", "Что такое GC?"),
      turn(1, "user", "Сборщик мусора."),
      turn(2, "interviewer", "А какие бывают?"),
    ]);
    expect(text).toBe("Интервьюер: Что такое GC?\nЯ: Сборщик мусора.\nИнтервьюер: А какие бывают?");
  });

  it("склеивает подряд идущие реплики одного говорящего в один блок", () => {
    const text = renderTurns([
      turn(0, "user", "Ну"),
      turn(1, "user", "примерно так."),
      turn(2, "interviewer", "Понял."),
    ]);
    expect(text).toBe("Я: Ну примерно так.\nИнтервьюер: Понял.");
  });
});

describe("planSubmission", () => {
  it("отправляет вопрос интервьюера", () => {
    const turns = [turn(0, "interviewer", "Что такое GC?")];
    expect(planSubmission(turns, NO_TURN_SUBMITTED)).toEqual({
      text: "Что такое GC?",
      throughSeq: 0,
    });
  });

  it("молчит, пока говорит пользователь", () => {
    const turns = [turn(0, "interviewer", "Вопрос?"), turn(1, "user", "Отвечаю…")];
    expect(planSubmission(turns, 0)).toBeNull();
  });

  it("не отправляет ничего, когда новых реплик нет", () => {
    const turns = [turn(0, "interviewer", "Вопрос?")];
    expect(planSubmission(turns, 0)).toBeNull();
  });

  it("прикладывает ответ пользователя как контекст к следующему вопросу", () => {
    const turns = [
      turn(0, "interviewer", "Что такое GC?"),
      turn(1, "user", "Сборщик мусора."),
      turn(2, "interviewer", "А какие бывают?"),
    ];
    expect(planSubmission(turns, 0)).toEqual({
      text: "Я: Сборщик мусора.\nИнтервьюер: А какие бывают?",
      throughSeq: 2,
    });
  });

  it("не отправляет одно и то же дважды", () => {
    const turns = [turn(0, "interviewer", "Вопрос?")];
    const first = planSubmission(turns, NO_TURN_SUBMITTED);
    expect(first).not.toBeNull();
    expect(planSubmission(turns, first?.throughSeq ?? NO_TURN_SUBMITTED)).toBeNull();
  });

  it("отправляет только речь пользователя без вопроса — никогда", () => {
    const turns = [turn(0, "user", "Просто думаю вслух.")];
    expect(planSubmission(turns, NO_TURN_SUBMITTED)).toBeNull();
  });

  it("пропускает окно, где интервьюер сказал только пустоту", () => {
    const turns = [turn(0, "interviewer", "   ")];
    expect(planSubmission(turns, NO_TURN_SUBMITTED)).toBeNull();
  });
});

describe("planDispatch", () => {
  it("на свободном чате просто отправляет", () => {
    expect(planDispatch("Вопрос?", false)).toEqual({ interrupt: false, send: true });
  });

  it("на занятом чате прерывает предыдущий ответ и отправляет новый вопрос", () => {
    expect(planDispatch("Новый вопрос?", true)).toEqual({ interrupt: true, send: true });
  });

  it("пустой текст не отправляется и ничего не прерывает", () => {
    expect(planDispatch("   ", true)).toEqual({ interrupt: false, send: false });
    expect(planDispatch("", false)).toEqual({ interrupt: false, send: false });
  });
});

describe("planManualSubmission", () => {
  it("отправляет всё несданное, чья бы реплика ни была последней", () => {
    const turns = [turn(0, "interviewer", "Вопрос?"), turn(1, "user", "Мой ответ.")];
    expect(planManualSubmission(turns, NO_TURN_SUBMITTED)).toEqual({
      text: "Интервьюер: Вопрос?\nЯ: Мой ответ.",
      throughSeq: 1,
    });
  });

  it("там, где мгновенный режим промолчал бы, ручной отвечает", () => {
    const turns = [turn(0, "user", "Договорил.")];
    expect(planSubmission(turns, NO_TURN_SUBMITTED)).toBeNull();
    expect(planManualSubmission(turns, NO_TURN_SUBMITTED)?.throughSeq).toBe(0);
  });

  it("сдавать нечего — плана нет", () => {
    expect(planManualSubmission([], NO_TURN_SUBMITTED)).toBeNull();
    const turns = [turn(0, "interviewer", "Вопрос?")];
    expect(planManualSubmission(turns, 0)).toBeNull();
  });

  it("пустой текст не уходит в чат", () => {
    expect(planManualSubmission([turn(0, "interviewer", "   ")], NO_TURN_SUBMITTED)).toBeNull();
  });
});
