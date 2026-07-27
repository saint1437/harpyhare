import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuickActionsBar } from "./QuickActionsBar";
import type { QuickAction } from "@/ipc/types";

afterEach(() => {
  cleanup();
});

const TRANSLATE: QuickAction = {
  id: "translate",
  title: "Перевести",
  prompt: "Переведи ответ на английский",
};
const SHORTEN: QuickAction = { id: "shorten", title: "Короче", prompt: "Сократи до трёх пунктов" };

const COMBO = "Cmd";

describe("QuickActionsBar", () => {
  it("пустой список не рисует полосу", () => {
    const { container } = render(
      <QuickActionsBar actions={[]} combo={COMBO} disabled={false} onRun={() => undefined} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("показывает заголовок действия и не показывает промпт", () => {
    const { getByText, queryByText } = render(
      <QuickActionsBar
        actions={[TRANSLATE]}
        combo={COMBO}
        disabled={false}
        onRun={() => undefined}
      />,
    );
    expect(getByText(TRANSLATE.title)).toBeTruthy();
    expect(queryByText(TRANSLATE.prompt)).toBeNull();
  });

  it("клик запускает своё действие", () => {
    const onRun = vi.fn();
    const { getByTitle } = render(
      <QuickActionsBar
        actions={[TRANSLATE, SHORTEN]}
        combo={COMBO}
        disabled={false}
        onRun={onRun}
      />,
    );
    fireEvent.click(getByTitle(SHORTEN.title));
    expect(onRun).toHaveBeenCalledTimes(1);
    expect(onRun).toHaveBeenCalledWith(SHORTEN);
  });

  it("во время стрима кнопки не кликаются", () => {
    const onRun = vi.fn();
    const { getByTitle } = render(
      <QuickActionsBar actions={[TRANSLATE]} combo={COMBO} disabled={true} onRun={onRun} />,
    );
    const button = getByTitle(TRANSLATE.title);
    expect(button.hasAttribute("disabled")).toBe(true);
    fireEvent.click(button);
    expect(onRun).not.toHaveBeenCalled();
  });

  it("подсказка сочетания содержит цифру позиции", () => {
    const { getByTitle } = render(
      <QuickActionsBar
        actions={[TRANSLATE, SHORTEN]}
        combo={COMBO}
        disabled={false}
        onRun={() => undefined}
      />,
    );
    expect(getByTitle(TRANSLATE.title).textContent).toContain("1");
    expect(getByTitle(SHORTEN.title).textContent).toContain("2");
  });

  it("без сочетания подсказки нет, кнопка остаётся кликабельной", () => {
    const onRun = vi.fn();
    const { getByTitle } = render(
      <QuickActionsBar actions={[TRANSLATE]} combo="" disabled={false} onRun={onRun} />,
    );
    const button = getByTitle(TRANSLATE.title);
    expect(button.textContent).toBe(TRANSLATE.title);
    fireEvent.click(button);
    expect(onRun).toHaveBeenCalledWith(TRANSLATE);
  });

  it("нажатие мышью не уводит фокус из поля ввода", () => {
    const { getByTitle } = render(
      <QuickActionsBar
        actions={[TRANSLATE]}
        combo={COMBO}
        disabled={false}
        onRun={() => undefined}
      />,
    );
    expect(fireEvent.mouseDown(getByTitle(TRANSLATE.title))).toBe(false);
  });
});
