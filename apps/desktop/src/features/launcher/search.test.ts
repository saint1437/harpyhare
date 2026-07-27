import { describe, expect, it } from "vitest";
import { searchLauncher, type SearchHit, type SearchSources } from "./search";

const SOURCES: SearchSources = {
  presets: [{ id: "preset-1", name: "Мой пресет" }],
  quickActions: [{ id: "quick-1", title: "Короче" }],
  contextDocs: [{ id: "doc-1", name: "Резюме" }],
};

function titles(hits: SearchHit[]): string[] {
  return hits.map((hit) => hit.title);
}

function byId(hits: SearchHit[], id: string): SearchHit {
  const hit = hits.find((h) => h.id === id);
  if (!hit) throw new Error(`нет результата ${id}`);
  return hit;
}

describe("searchLauncher", () => {
  it("пустой запрос не отдаёт весь индекс", () => {
    expect(searchLauncher("", SOURCES)).toEqual([]);
    expect(searchLauncher("   ", SOURCES)).toEqual([]);
  });

  it("находит экран по описанию", () => {
    const hit = byId(searchLauncher("справочные материалы", SOURCES), "screen:contexts");
    expect(hit.title).toBe("Контексты");
    expect(hit.screen).toBe("contexts");
    expect(hit.tab).toBeNull();
    expect(hit.breadcrumb).toBe("Контексты");
  });

  it("находит хоткей по подписи и ведёт на вкладку клавиш", () => {
    const hit = byId(searchLauncher("снимок области", SOURCES), "hotkey:screenshot");
    expect(hit.screen).toBe("settings");
    expect(hit.tab).toBe("hotkeys");
    expect(hit.breadcrumb).toBe("Настройки → Клавиши");
  });

  it("семейство цифр ведёт в быстрые действия, а не в горячие клавиши", () => {
    const hit = byId(searchLauncher("быстрое действие", SOURCES), "hotkey:quick_action");
    expect(hit.tab).toBe("quick-actions");
    expect(hit.breadcrumb).toBe("Настройки → Действия");
  });

  it("семейства стрелок ведут на вкладку окна", () => {
    const hits = searchLauncher("модификатор со стрелками", SOURCES);
    expect(byId(hits, "hotkey:move_window").tab).toBe("window");
    expect(byId(hits, "hotkey:resize_window").tab).toBe("window");
    expect(byId(hits, "hotkey:scroll_chat").tab).toBe("window");
  });

  it("находит пресет пользователя", () => {
    const hit = byId(searchLauncher("мой пресет", SOURCES), "preset:preset-1");
    expect(hit.title).toBe("Мой пресет");
    expect(hit.screen).toBe("presets");
    expect(hit.tab).toBeNull();
    expect(hit.breadcrumb).toBe("Пресеты");
  });

  it("находит быстрое действие пользователя", () => {
    const hit = byId(searchLauncher("короче", SOURCES), "quickAction:quick-1");
    expect(hit.title).toBe("Короче");
    expect(hit.screen).toBe("settings");
    expect(hit.tab).toBe("quick-actions");
  });

  it("совпадение в заголовке важнее совпадения в пояснении", () => {
    const found = titles(searchLauncher("запис", SOURCES));
    expect(found[0]).toBe("Записать системный звук");
    expect(found).toContain("Отменить запись");
    expect(found).toContain("Фоновый буфер");
    expect(found.indexOf("Отменить запись")).toBeLessThan(found.indexOf("Фоновый буфер"));
  });

  it("на Windows маскировки не существует и в выдаче её нет", () => {
    expect(titles(searchLauncher("маскировка", SOURCES, "macos"))).toEqual(["Маскировка"]);
    expect(searchLauncher("маскировка", SOURCES, "windows")).toEqual([]);
  });

  it("вкладка настроек находится по имени и ведёт на себя", () => {
    const hit = byId(searchLauncher("клавиши", SOURCES), "tab:hotkeys");
    expect(hit.screen).toBe("settings");
    expect(hit.tab).toBe("hotkeys");
  });

  it("строки доступов ищутся на macOS и не существуют на Windows", () => {
    const hit = byId(searchLauncher("запись экрана", SOURCES, "macos"), "permission:screen");
    expect(hit.screen).toBe("permissions");
    const windowsIds = searchLauncher("запись экрана", SOURCES, "windows").map((h) => h.id);
    expect(windowsIds).not.toContain("permission:screen");
  });

  it("материал библиотеки находится по имени", () => {
    const hit = byId(searchLauncher("резюме", SOURCES), "contextDoc:doc-1");
    expect(hit.screen).toBe("contexts");
    expect(hit.tab).toBeNull();
  });

  it("строка активного кода доступа находится по слову «отвязка»", () => {
    const hits = searchLauncher("отвязка", SOURCES);
    expect(hits.some((hit) => hit.title === "Код доступа активен")).toBe(true);
  });

  it("модификатор прозрачности не индексируется — строки настройки для него нет", () => {
    const ids = searchLauncher("прозрачность", SOURCES).map((hit) => hit.id);
    expect(ids).not.toContain("hotkey:opacity");
    expect(ids).toContain("setting:appearance:Прозрачность окна");
  });

  it("идентификаторы в выдаче уникальны", () => {
    const ids = searchLauncher("о", SOURCES).map((hit) => hit.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
