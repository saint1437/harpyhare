import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QUICK_ACTION_LIMIT } from "@/ipc/bindings";
import { DEFAULT_SETTINGS, type QuickAction, type Settings } from "@/ipc/types";
import type { SetSetting } from "../contract";
import { QuickActionsSection } from "./QuickActionsSection";

const EMPTY_ACTION: QuickAction = { id: "empty", title: "", prompt: "" };

function filled(order: number): QuickAction {
  const number = String(order);
  return { id: `action-${number}`, title: `Действие ${number}`, prompt: `Промпт ${number}` };
}

function list(size: number): QuickAction[] {
  return Array.from({ length: size }, (_, index) => filled(index + 1));
}

function renderSection(quickActions: QuickAction[], overrides: Partial<Settings> = {}) {
  const set = vi.fn<SetSetting>();
  render(
    <QuickActionsSection
      draft={{ ...DEFAULT_SETTINGS, quick_actions: quickActions, ...overrides }}
      set={set}
    />,
  );
  return set;
}

function addButton(): HTMLButtonElement {
  const button = screen.getByText("Добавить").closest("button");
  if (!button) throw new Error("кнопка добавления не найдена");
  return button;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("QuickActionsSection", () => {
  it("«Добавить» создаёт пустую запись, пока не достигнут предел", () => {
    const set = renderSection(list(1));
    expect(addButton().disabled).toBe(false);
    fireEvent.click(addButton());
    const [key, value] = set.mock.calls[0] ?? [];
    expect(key).toBe("quick_actions");
    expect(value).toHaveLength(2);
  });

  it("на пределе «Добавить» заблокирована", () => {
    const set = renderSection(list(QUICK_ACTION_LIMIT));
    expect(addButton().disabled).toBe(true);
    fireEvent.click(addButton());
    expect(set).not.toHaveBeenCalled();
  });

  it("удаление убирает свою строку", () => {
    const set = renderSection(list(2));
    const remove = screen.getAllByTitle("Удалить быстрое действие");
    const second = remove[1];
    if (!second) throw new Error("нет кнопки удаления у второй строки");
    fireEvent.click(second);
    expect(set).toHaveBeenCalledWith("quick_actions", [filled(1)]);
  });

  it("правка названия уходит через set", () => {
    const set = renderSection(list(1));
    const [title] = screen.getAllByLabelText("Название");
    if (!title) throw new Error("нет поля названия");
    fireEvent.change(title, { target: { value: "Перевести" } });
    expect(set).toHaveBeenCalledWith("quick_actions", [{ ...filled(1), title: "Перевести" }]);
  });

  it("правка промпта уходит через set", () => {
    const set = renderSection(list(1));
    const [prompt] = screen.getAllByLabelText("Промпт");
    if (!prompt) throw new Error("нет поля промпта");
    fireEvent.change(prompt, { target: { value: "Переведи на английский" } });
    expect(set).toHaveBeenCalledWith("quick_actions", [
      { ...filled(1), prompt: "Переведи на английский" },
    ]);
  });

  it("тумблер вложений переключается", () => {
    const set = renderSection(list(1), { quick_action_attachments: false });
    fireEvent.click(screen.getByLabelText("Прикреплять вложения"));
    expect(set).toHaveBeenCalledWith("quick_action_attachments", true);
  });

  it("цифру получают только заполненные действия, по своему порядку", () => {
    renderSection([filled(1), EMPTY_ACTION, filled(2)]);
    expect(screen.getByText("⌘1")).not.toBeNull();
    expect(screen.getByText("⌘2")).not.toBeNull();
    expect(screen.queryByText("⌘3")).toBeNull();
  });
});
