import { describe, expect, it } from "vitest";
import { splitStableTail } from "./stream-markdown";

describe("splitStableTail", () => {
  it("режет по последней границе абзаца", () => {
    expect(splitStableTail("раз\n\nдва\n\nтри-хвост")).toEqual(["раз\n\nдва\n\n", "три-хвост"]);
  });

  it("без границ — всё уходит в хвост", () => {
    expect(splitStableTail("одна строка без пустых")).toEqual(["", "одна строка без пустых"]);
  });

  it("не режет внутри незакрытого код-блока", () => {
    const text = "текст\n\n```js\nconst a = 1;\n\nconst b = 2;";
    expect(splitStableTail(text)).toEqual(["текст\n\n", "```js\nconst a = 1;\n\nconst b = 2;"]);
  });

  it("закрытый код-блок попадает в стабильный префикс", () => {
    const text = "```js\nconst a = 1;\n```\n\nхвост";
    expect(splitStableTail(text)).toEqual(["```js\nconst a = 1;\n```\n\n", "хвост"]);
  });

  it("пустая строка и текст с ведущей границей не ломаются", () => {
    expect(splitStableTail("")).toEqual(["", ""]);
    expect(splitStableTail("\n\nхвост")).toEqual(["", "\n\nхвост"]);
  });
});

/**
 * `splitStableTail` remembers the last answer it judged so that a stream, which
 * calls it once per frame with a few more characters, rescans only what was
 * appended. The memory must not be visible in the answers: a warm call has to
 * return what a cold one would.
 */
describe("splitStableTail — память между вызовами", () => {
  // Пустой текст ничего не продолжает, поэтому обнуляет память.
  function coldSplit(text: string) {
    splitStableTail("");
    return splitStableTail(text);
  }

  const STREAM =
    "\n\nвступление\n\nраз\n\n```js\nconst a = 1;\n\nconst b = 2;\n```\n\n" +
    "два\n\n~~~\nещё\n\nблок\n~~~\n\nтри-хвост";

  it("растущий стрим режется так же, как холодные вызовы", () => {
    const cold: [string, string][] = [];
    for (let i = 1; i <= STREAM.length; i += 1) cold.push(coldSplit(STREAM.slice(0, i)));

    splitStableTail("");
    const warm: [string, string][] = [];
    for (let i = 1; i <= STREAM.length; i += 1) warm.push(splitStableTail(STREAM.slice(0, i)));

    expect(warm).toEqual(cold);
  });

  it("два стрима вперемешку не портят друг другу разрез", () => {
    const other = "другой ответ\n\nсвой хвост";
    for (let i = 1; i <= STREAM.length; i += 1) {
      splitStableTail(other.slice(0, Math.min(i, other.length)));
      expect(splitStableTail(STREAM.slice(0, i))).toEqual(coldSplit(STREAM.slice(0, i)));
    }
  });
});
