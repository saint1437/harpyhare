import { describe, expect, it } from "vitest";
import { permissionRowCopy } from "@/features/settings/permission-rows";
import { SETTINGS_ENTRIES } from "@/features/settings/settings-registry";
import { dictionary, LOCALES } from "@/i18n";
import type { Dictionary } from "@/i18n/types";
import { hotkeyAction, hotkeyLabel, type HotkeyActionId } from "@/lib/hotkeys";
import { searchLauncher, type SearchHit, type SearchSources } from "./search";
import { WINDOW_PAIRS } from "./window-pairs";

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

function label(id: HotkeyActionId, dict: Dictionary): string {
  return hotkeyLabel(hotkeyAction(id), dict);
}

function breadcrumb(dict: Dictionary, tab?: keyof Dictionary["settings"]["tabs"]): string {
  const settings = dict.launcher.screens.settings.label;
  if (tab === undefined) return settings;
  return [settings, dict.settings.tabs[tab].label].join(dict.launcher.search.breadcrumbSeparator);
}

// Каждый случай прогоняется по обоим языкам: индекс — чистая функция словаря,
// и непереведённая строка ловится тем, что тот же случай на `en` не находит
// ничего либо возвращает русский текст.
describe.each(LOCALES)("searchLauncher (%s)", (locale) => {
  const dict = dictionary(locale);
  const search = (query: string, platform?: "macos" | "windows") =>
    searchLauncher(query, SOURCES, dict, platform);

  it("пустой запрос не отдаёт весь индекс", () => {
    expect(search("")).toEqual([]);
    expect(search("   ")).toEqual([]);
  });

  it("находит экран по описанию", () => {
    const screen = dict.launcher.screens.contexts;
    const hit = byId(search(screen.description), "screen:contexts");
    expect(hit.title).toBe(screen.label);
    expect(hit.screen).toBe("contexts");
    expect(hit.tab).toBeNull();
    expect(hit.breadcrumb).toBe(screen.label);
  });

  it("находит хоткей по подписи и ведёт на вкладку клавиш", () => {
    const hit = byId(search(label("screenshot", dict)), "hotkey:screenshot");
    expect(hit.screen).toBe("settings");
    expect(hit.tab).toBe("hotkeys");
    expect(hit.breadcrumb).toBe(breadcrumb(dict, "hotkeys"));
  });

  it("семейство цифр ведёт в быстрые действия, а не в горячие клавиши", () => {
    const hit = byId(search(label("quick_action", dict)), "hotkey:quick_action");
    expect(hit.tab).toBe("quick-actions");
    expect(hit.breadcrumb).toBe(breadcrumb(dict, "quick-actions"));
  });

  it("семейства стрелок ведут на вкладку окна", () => {
    for (const pair of WINDOW_PAIRS) {
      const hit = byId(search(label(pair.action, dict)), `hotkey:${pair.action}`);
      expect(hit.tab, pair.action).toBe("window");
    }
  });

  it("находит пресет пользователя", () => {
    const hit = byId(search("мой пресет"), "preset:preset-1");
    expect(hit.title).toBe("Мой пресет");
    expect(hit.screen).toBe("presets");
    expect(hit.tab).toBeNull();
    expect(hit.breadcrumb).toBe(dict.launcher.screens.presets.label);
  });

  it("находит быстрое действие пользователя", () => {
    const hit = byId(search("короче"), "quickAction:quick-1");
    expect(hit.title).toBe("Короче");
    expect(hit.screen).toBe("settings");
    expect(hit.tab).toBe("quick-actions");
  });

  it("совпадение в заголовке важнее совпадения в пояснении", () => {
    // Подписи берём из словаря, а не литералами: он единственный источник, и
    // переименование строки не должно ронять тест вместе с кодом. «Фоновый
    // буфер» — строка настройки и одновременно слово в описании вкладки «Речь»,
    // то есть ровно пара «совпадение в заголовке против совпадения в подсказке».
    const row = dict.settings.entries.buffer_enabled.label;
    const found = titles(search(row));
    expect(found[0]).toBe(row);
    expect(found).toContain(dict.settings.tabs.speech.label);
    expect(found.indexOf(row)).toBeLessThan(found.indexOf(dict.settings.tabs.speech.label));
  });

  it("на Windows экранов только для macOS не существует и в выдаче их нет", () => {
    const permissions = dict.launcher.screens.permissions;
    expect(titles(search(permissions.label, "macos"))).toContain(permissions.label);
    expect(search(permissions.label, "windows").every((hit) => hit.screen !== "permissions")).toBe(
      true,
    );
  });

  it("вкладка настроек находится по имени и ведёт на себя", () => {
    const hit = byId(search(dict.settings.tabs.hotkeys.label), "tab:hotkeys");
    expect(hit.screen).toBe("settings");
    expect(hit.tab).toBe("hotkeys");
  });

  it("строки доступов ищутся на macOS и не существуют на Windows", () => {
    const screenRow = permissionRowCopy("screen", dict);
    const hit = byId(search(screenRow.title, "macos"), "permission:screen");
    expect(hit.screen).toBe("permissions");
    const windowsIds = search(screenRow.title, "windows").map((h) => h.id);
    expect(windowsIds).not.toContain("permission:screen");
  });

  it("материал библиотеки находится по имени", () => {
    const hit = byId(search("резюме"), "contextDoc:doc-1");
    expect(hit.screen).toBe("contexts");
    expect(hit.tab).toBeNull();
  });

  it("строка активного кода доступа находится по своей подсказке", () => {
    const copy = dict.settings.apiKeys;
    const hits = search(copy.accessCodeActiveHint);
    expect(hits.some((hit) => hit.title === copy.accessCodeActiveLabel)).toBe(true);
  });

  it("модификатор прозрачности не индексируется — строки настройки для него нет", () => {
    const opacityRow = dict.settings.entries.window_opacity.label;
    const ids = search(label("opacity", dict)).map((hit) => hit.id);
    expect(ids).not.toContain("hotkey:opacity");
    expect(ids).toContain(`setting:appearance:${opacityRow}`);
  });

  it("идентификаторы в выдаче уникальны", () => {
    const ids = search(dict.launcher.screens.settings.label[0] ?? "").map((hit) => hit.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("ни один результат не приходит с пустым заголовком или пояснением", () => {
    // Ловит непереведённую запись: пустая строка в словаре доезжает до выдачи
    // молча, а хит без пояснения перестаёт находиться по смыслу.
    const seen = new Set<string>();
    for (const entry of SETTINGS_ENTRIES) {
      for (const hit of search(dict.settings.entries[entry.id].label)) {
        if (seen.has(hit.id)) continue;
        seen.add(hit.id);
        expect(hit.title.trim(), hit.id).not.toBe("");
        expect(hit.hint.trim(), hit.id).not.toBe("");
        expect(hit.breadcrumb.trim(), hit.id).not.toBe("");
      }
    }
    expect(seen.size).toBeGreaterThan(0);
  });
});

describe.each(LOCALES)("индекс обычных настроек (%s)", (locale) => {
  const dict = dictionary(locale);
  const search = (query: string) => searchLauncher(query, SOURCES, dict);

  // The 23 hand-written copies of these labels are the whole reason the registry
  // exists: search used to match a sentence that had been reworded on screen.
  it("каждая запись реестра находится по своей подписи и ведёт на свою вкладку", () => {
    for (const entry of SETTINGS_ENTRIES) {
      const { label: rowLabel } = dict.settings.entries[entry.id];
      const hit = search(rowLabel).find((h) => h.title === rowLabel);
      expect(hit, entry.id).toBeDefined();
      expect(hit?.screen).toBe("settings");
      expect(hit?.tab).toBe(entry.tab);
    }
  });

  it("подсказка реестра ищется дословно", () => {
    for (const entry of SETTINGS_ENTRIES) {
      const { hint } = dict.settings.entries[entry.id];
      expect(
        search(hint).some((h) => h.hint === hint),
        entry.id,
      ).toBe(true);
    }
  });

  it("настроечные строки не дублируются по id", () => {
    const hits = SETTINGS_ENTRIES.flatMap((entry) =>
      search(dict.settings.entries[entry.id].label).filter((h) => h.id.startsWith("setting:")),
    );
    const ids = hits.map((h) => h.id);
    expect(new Set(ids).size).toBe(new Set(hits.map((h) => h.title + h.id)).size);
  });
});
