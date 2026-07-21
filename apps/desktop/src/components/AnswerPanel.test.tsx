import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnswerPanel } from "./AnswerPanel";
import type { ChatMessage } from "@/lib/chats";

vi.mock("@/ipc/commands", () => ({
  openExternal: vi.fn(),
}));

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const userMsg: ChatMessage = { role: "user", text: "напиши тетрис", images: [] };

describe("AnswerPanel — подсветка кода", () => {
  it("код с языком получает hljs-токены", () => {
    const assistant: ChatMessage = {
      role: "assistant",
      text: 'Вот:\n\n```js\nconst a = "строка"; // комментарий\n```\n',
      images: [],
    };
    const { container } = render(
      <AnswerPanel
        messages={[assistant]}
        partial={null}
        streaming={false}
        onTogglePreview={() => undefined}
        onRemoveMessage={() => undefined}
      />,
    );
    expect(container.querySelector("code.hljs")).toBeTruthy();
    expect(container.querySelector(".hljs-keyword")?.textContent).toBe("const");
    expect(container.querySelector(".hljs-string")).toBeTruthy();
    expect(container.querySelector(".hljs-comment")).toBeTruthy();
  });

  it("код без языка автоопределяется", () => {
    const assistant: ChatMessage = {
      role: "assistant",
      text: "```\ndef main():\n    return 42\n```\n",
      images: [],
    };
    const { container } = render(
      <AnswerPanel
        messages={[assistant]}
        partial={null}
        streaming={false}
        onTogglePreview={() => undefined}
        onRemoveMessage={() => undefined}
      />,
    );
    expect(container.querySelector(".hljs-keyword")).toBeTruthy();
  });

  it("```html остаётся чипом превью, а не подсвеченным кодом", () => {
    const assistant: ChatMessage = {
      role: "assistant",
      text: "```html\n<h1>привет</h1>\n```\n",
      images: [],
    };
    const { container, getByText } = render(
      <AnswerPanel
        messages={[assistant]}
        partial={null}
        streaming={false}
        onTogglePreview={() => undefined}
        onRemoveMessage={() => undefined}
      />,
    );
    expect(getByText(/Открыть превью/)).toBeTruthy();
    expect(container.querySelector("code.hljs")).toBeNull();
  });
});

describe("AnswerPanel — индикатор ожидания", () => {
  it("показывает «Думает…», пока стрим без текста", () => {
    const { getByText } = render(
      <AnswerPanel
        messages={[userMsg]}
        partial=""
        streaming={true}
        onTogglePreview={() => undefined}
        onRemoveMessage={() => undefined}
      />,
    );
    expect(getByText(/Думает…/)).toBeTruthy();
  });

  it("не показывает индикатор, когда пошёл текст ответа", () => {
    const { queryByText } = render(
      <AnswerPanel
        messages={[userMsg]}
        partial="Привет"
        streaming={true}
        onTogglePreview={() => undefined}
        onRemoveMessage={() => undefined}
      />,
    );
    expect(queryByText(/Думает…/)).toBeNull();
  });

  it("не показывает индикатор без стрима", () => {
    const { queryByText } = render(
      <AnswerPanel
        messages={[userMsg]}
        partial={null}
        streaming={false}
        onTogglePreview={() => undefined}
        onRemoveMessage={() => undefined}
      />,
    );
    expect(queryByText(/Думает…/)).toBeNull();
  });
});
