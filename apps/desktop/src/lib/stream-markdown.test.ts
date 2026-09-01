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

// Так режет стрим `useStreamChunks` в AnswerPanel: граница ищется только в том,
// что дописали с прошлого кадра, а не во всём ответе.
function incrementalSplit(text: string): { chunks: string[]; tail: string } {
  let consumed = 0;
  const chunks: string[] = [];
  for (let end = 1; end <= text.length; end += 1) {
    const [settled] = splitStableTail(text.slice(consumed, end));
    if (settled !== "") {
      chunks.push(settled);
      consumed += settled.length;
    }
  }
  return { chunks, tail: text.slice(consumed) };
}

function fenceMarkerCount(text: string): number {
  return text.match(/^\s{0,3}(?:```|~~~)/gm)?.length ?? 0;
}

describe("нарастающее деление стрима", () => {
  const withCode =
    "первый абзац\n\nвторой\n\n```go\nfunc main() {\n\n\tprintln(1)\n}\n```\n\nхвост";

  it("склеивается обратно в исходный текст", () => {
    const { chunks, tail } = incrementalSplit(withCode);
    expect(chunks.join("") + tail).toBe(withCode);
  });

  it("не режет незакрытый код-блок пополам", () => {
    const { chunks } = incrementalSplit(withCode);
    for (const chunk of chunks) {
      expect(fenceMarkerCount(chunk) % 2).toBe(0);
    }
  });

  it("даёт те же куски, что и деление целиком, для текста без кода", () => {
    const prose = "один\n\nдва\n\nтри";
    const { chunks, tail } = incrementalSplit(prose);
    const [stable, wholeTail] = splitStableTail(prose);
    expect(chunks.join("")).toBe(stable);
    expect(tail).toBe(wholeTail);
  });
});
