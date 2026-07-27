import { act, cleanup, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

type Handler = (payload: unknown) => void;
const handlers = new Map<string, Handler>();

vi.mock("@/ipc/events", () => ({
  onEvent: (name: string, handler: Handler) => {
    handlers.set(name, handler);
    return () => {
      handlers.delete(name);
    };
  },
}));

import { usePromptFocus } from "./usePromptFocus";

const FOCUS_PROMPT_EVENT = "focus-prompt";
const DRAFT_TEXT = "недописанный вопрос";

function emitFocusPrompt() {
  act(() => handlers.get(FOCUS_PROMPT_EVENT)?.(null));
}

function PromptField({ suspended, text }: { suspended: boolean; text: string }) {
  const ref = usePromptFocus(suspended);
  return createElement("textarea", { ref, defaultValue: text });
}

function renderPromptField(suspended: boolean, text = "") {
  const view = render(createElement(PromptField, { suspended, text }));
  const field = document.querySelector("textarea");
  if (!field) throw new Error("поле промпта не отрисовалось");
  const setSuspended = (next: boolean) => {
    view.rerender(createElement(PromptField, { suspended: next, text }));
  };
  return { field, setSuspended };
}

afterEach(() => {
  cleanup();
  handlers.clear();
  document.body.innerHTML = "";
});

describe("usePromptFocus", () => {
  it("каретка попадает в поле сразу на маунте", () => {
    const { field } = renderPromptField(false);
    expect(document.activeElement).toBe(field);
  });

  it("событие focus-prompt возвращает фокус в поле", () => {
    const { field } = renderPromptField(false);
    field.blur();
    expect(document.activeElement).not.toBe(field);
    emitFocusPrompt();
    expect(document.activeElement).toBe(field);
  });

  it("под открытым суфлёром поле не фокусируется ни на маунте, ни по событию", () => {
    const { field } = renderPromptField(true);
    expect(document.activeElement).not.toBe(field);
    emitFocusPrompt();
    expect(document.activeElement).not.toBe(field);
  });

  it("появившийся оверлей снимает каретку с поля, а его закрытие возвращает", () => {
    const { field, setSuspended } = renderPromptField(false);
    expect(document.activeElement).toBe(field);
    act(() => {
      setSuspended(true);
    });
    expect(document.activeElement).not.toBe(field);
    act(() => {
      setSuspended(false);
    });
    expect(document.activeElement).toBe(field);
  });

  it("каретка встаёт в конец уже набранного текста", () => {
    const { field } = renderPromptField(false, DRAFT_TEXT);
    field.setSelectionRange(0, 0);
    emitFocusPrompt();
    expect(field.selectionStart).toBe(DRAFT_TEXT.length);
    expect(field.selectionEnd).toBe(DRAFT_TEXT.length);
  });
});
