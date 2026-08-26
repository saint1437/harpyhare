import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SETTINGS_TABS } from "@/features/settings/settings-tabs";
import { getDict } from "@/i18n";
import { SettingsTabsRail } from "./SettingsTabsRail";

const [ACTIVE_TAB, OTHER_TAB] = SETTINGS_TABS;

// Подписи вкладок — единственный источник: реестр их больше не носит.
function tabLabel(id: (typeof SETTINGS_TABS)[number]["id"]): string {
  return getDict().settings.tabs[id].label;
}

function tab(label: string): HTMLElement {
  return screen.getByRole("tab", { name: label });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SettingsTabsRail", () => {
  it("рисует все табы реестра", () => {
    render(<SettingsTabsRail active={ACTIVE_TAB.id} onSelect={vi.fn()} />);
    expect(screen.getAllByRole("tab")).toHaveLength(SETTINGS_TABS.length);
    for (const meta of SETTINGS_TABS) expect(tab(tabLabel(meta.id))).not.toBeNull();
  });

  it("клик по табу зовёт колбэк с его id", () => {
    const onSelect = vi.fn();
    render(<SettingsTabsRail active={ACTIVE_TAB.id} onSelect={onSelect} />);
    fireEvent.click(tab(tabLabel(OTHER_TAB.id)));
    expect(onSelect).toHaveBeenCalledWith(OTHER_TAB.id);
  });

  it("активный таб помечен для доступности, остальные — нет", () => {
    render(<SettingsTabsRail active={ACTIVE_TAB.id} onSelect={vi.fn()} />);
    expect(tab(tabLabel(ACTIVE_TAB.id)).getAttribute("aria-selected")).toBe("true");
    expect(tab(tabLabel(OTHER_TAB.id)).getAttribute("aria-selected")).toBe("false");
  });
});
