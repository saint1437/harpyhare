import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getDict } from "@/i18n";
import { LauncherSearch } from "./LauncherSearch";
import type { SearchHit, SearchSources } from "./search";

const PLACEHOLDER = getDict().launcher.search.placeholder;
const THEME_ROW = getDict().settings.entries.theme.label;
const APPEARANCE_BREADCRUMB = [
  getDict().launcher.screens.settings.label,
  getDict().settings.tabs.appearance.label,
].join(getDict().launcher.search.breadcrumbSeparator);

const SOURCES: SearchSources = {
  presets: [{ id: "preset-1", name: "Мой пресет" }],
  quickActions: [],
  contextDocs: [],
};

function field(): HTMLInputElement {
  return screen.getByPlaceholderText<HTMLInputElement>(PLACEHOLDER);
}

function type(value: string) {
  fireEvent.change(field(), { target: { value } });
}

function navigateSpy() {
  return vi.fn<(hit: SearchHit) => void>();
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("LauncherSearch", () => {
  it("ввод показывает результаты с путём до настройки", () => {
    render(<LauncherSearch sources={SOURCES} onNavigate={navigateSpy()} />);
    expect(screen.queryByRole("listbox")).toBeNull();
    type(THEME_ROW);
    const [option] = screen.getAllByRole("option");
    if (!option) throw new Error("нет результатов поиска");
    expect(option.textContent).toContain(THEME_ROW);
    expect(option.textContent).toContain(APPEARANCE_BREADCRUMB);
  });

  it("клик по результату зовёт onNavigate и очищает поиск", () => {
    const onNavigate = navigateSpy();
    render(<LauncherSearch sources={SOURCES} onNavigate={onNavigate} />);
    type("Мой пресет");
    fireEvent.click(screen.getByRole("option"));
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate.mock.calls[0]?.[0]?.screen).toBe("presets");
    expect(field().value).toBe("");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("стрелки двигают выделение, Enter открывает выделенный", () => {
    const onNavigate = navigateSpy();
    const presetsOnly: SearchSources = {
      presets: [
        { id: "p1", name: "Ремарка альфа" },
        { id: "p2", name: "Ремарка бета" },
        { id: "p3", name: "Ремарка гамма" },
      ],
      quickActions: [],
      contextDocs: [],
    };
    render(<LauncherSearch sources={presetsOnly} onNavigate={onNavigate} />);
    type("Ремарка");
    fireEvent.keyDown(field(), { key: "ArrowDown" });
    fireEvent.keyDown(field(), { key: "ArrowDown" });
    fireEvent.keyDown(field(), { key: "ArrowUp" });
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(onNavigate.mock.calls[0]?.[0]?.title).toBe("Ремарка бета");
  });

  it("Escape закрывает список и очищает запрос", () => {
    render(<LauncherSearch sources={SOURCES} onNavigate={navigateSpy()} />);
    type(THEME_ROW);
    expect(screen.queryByRole("listbox")).not.toBeNull();
    fireEvent.keyDown(field(), { key: "Escape" });
    expect(field().value).toBe("");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("потеря фокуса закрывает список, но запрос остаётся", () => {
    render(<LauncherSearch sources={SOURCES} onNavigate={navigateSpy()} />);
    type(THEME_ROW);
    fireEvent.blur(field());
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(field().value).toBe(THEME_ROW);
  });

  it("при отсутствии совпадений видно «Ничего не найдено»", () => {
    render(<LauncherSearch sources={SOURCES} onNavigate={navigateSpy()} />);
    type("ксилофон");
    expect(screen.getByText(getDict().launcher.search.empty)).not.toBeNull();
  });
});
