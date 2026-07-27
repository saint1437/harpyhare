import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsTabsRail } from "./SettingsTabsRail";
import { SETTINGS_TABS } from "./settings-tabs";

const [ACTIVE_TAB, OTHER_TAB] = SETTINGS_TABS;

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
    for (const meta of SETTINGS_TABS) expect(tab(meta.label)).not.toBeNull();
  });

  it("клик по табу зовёт колбэк с его id", () => {
    const onSelect = vi.fn();
    render(<SettingsTabsRail active={ACTIVE_TAB.id} onSelect={onSelect} />);
    fireEvent.click(tab(OTHER_TAB.label));
    expect(onSelect).toHaveBeenCalledWith(OTHER_TAB.id);
  });

  it("активный таб помечен для доступности, остальные — нет", () => {
    render(<SettingsTabsRail active={ACTIVE_TAB.id} onSelect={vi.fn()} />);
    expect(tab(ACTIVE_TAB.label).getAttribute("aria-selected")).toBe("true");
    expect(tab(OTHER_TAB.label).getAttribute("aria-selected")).toBe("false");
  });
});
