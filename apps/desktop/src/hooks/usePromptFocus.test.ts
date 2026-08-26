import { act, cleanup, render } from "@testing-library/react";
import { emitIpcEvent, resetIpcEventHandlers } from "@/test-utils/fake-ipc-events";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/ipc/events", async () => await import("@/test-utils/fake-ipc-events"));

import { usePromptFocus } from "./usePromptFocus";

const FOCUS_PROMPT_EVENT = "focus-prompt";
const DRAFT_TEXT = "недописанный вопрос";

function emitFocusPrompt() {
  emitIpcEvent(FOCUS_PROMPT_EVENT, null);
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
  resetIpcEventHandlers();
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

/** Клубок размонтирует композер целиком — как настоящее сворачивание окна. */
function CollapsibleField({ collapsed, text }: { collapsed: boolean; text: string }) {
  const ref = usePromptFocus(false, collapsed);
  return collapsed ? null : createElement("textarea", { ref, defaultValue: text });
}

describe("usePromptFocus и сворачивание окна", () => {
  // Композер при сворачивании размонтируется, ref обнуляется, а при
  // разворачивании монтируется заново. Эффект сам по себе не перезапустился бы:
  // ни suspended, ни focus не менялись — и каретка не возвращалась.
  it("после сворачивания и разворачивания каретка возвращается в конец текста", () => {
    const view = render(createElement(CollapsibleField, { collapsed: false, text: DRAFT_TEXT }));
    expect(document.activeElement).toBe(document.querySelector("textarea"));

    view.rerender(createElement(CollapsibleField, { collapsed: true, text: DRAFT_TEXT }));
    expect(document.querySelector("textarea")).toBeNull();

    view.rerender(createElement(CollapsibleField, { collapsed: false, text: DRAFT_TEXT }));
    const field = document.querySelector("textarea");
    if (!field) throw new Error("поле промпта не вернулось после разворачивания");
    expect(document.activeElement).toBe(field);
    expect(field.selectionStart).toBe(DRAFT_TEXT.length);
  });
});
