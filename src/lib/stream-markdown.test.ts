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
    // последняя "\n\n" внутри fence → откатываемся к границе перед блоком
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
