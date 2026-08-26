import { describe, expect, it } from "vitest";
import { LOCALES, dictionary } from "@/i18n";
import { DEFAULT_SETTINGS } from "@/ipc/types";
import {
  SETTINGS_ENTRIES,
  SETTINGS_GROUPS,
  settingsEntriesInGroup,
  settingsGroupsForTab,
} from "./settings-registry";
import { SETTINGS_TABS } from "./settings-tabs";

const TAB_IDS = new Set<string>(SETTINGS_TABS.map((tab) => tab.id));

describe("settings registry", () => {
  it("не имеет дублей по id", () => {
    const ids = SETTINGS_ENTRIES.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("каждая запись ссылается на существующую вкладку", () => {
    for (const entry of SETTINGS_ENTRIES) {
      expect(TAB_IDS.has(entry.tab)).toBe(true);
    }
  });

  it("каждая группа ссылается на существующую вкладку и не пуста", () => {
    for (const group of SETTINGS_GROUPS) {
      expect(TAB_IDS.has(group.tab)).toBe(true);
      expect(settingsEntriesInGroup(group.id).length).toBeGreaterThan(0);
    }
  });

  it("вкладка записи совпадает с вкладкой её группы", () => {
    for (const entry of SETTINGS_ENTRIES) {
      if (entry.group === null) continue;
      const group = SETTINGS_GROUPS.find((g) => g.id === entry.group);
      expect(group).toBeDefined();
      expect(group?.tab).toBe(entry.tab);
    }
  });

  // A row that names a field the backend does not have renders `undefined` into
  // a control and writes it straight back through `set_settings`.
  it("каждое поле указывает на существующую настройку", () => {
    for (const entry of SETTINGS_ENTRIES) {
      expect(entry.field.key in DEFAULT_SETTINGS).toBe(true);
    }
  });

  // The wording is one source now — the dictionary — and the search index reads
  // the very same entry the row renders. Both locales are checked: a row that
  // exists only in the source language is a blank control in the other.
  it.each(LOCALES)("подпись и подсказка непусты в локали %s", (locale) => {
    const copy = dictionary(locale).settings.entries;
    for (const entry of SETTINGS_ENTRIES) {
      expect(copy[entry.id].label.trim()).not.toBe("");
      expect(copy[entry.id].hint.trim()).not.toBe("");
    }
  });

  it("группы вкладки отдаются в порядке реестра", () => {
    expect(settingsGroupsForTab("speech").map((g) => g.id)).toEqual(["stt", "auto-mode"]);
    expect(settingsGroupsForTab("hotkeys")).toEqual([]);
  });
});
