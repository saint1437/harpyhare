import { describe, expect, it } from "vitest";
import { comboTokens, formatCombo, hotkeyGroups } from "./hotkeys";

const CFG = {
  ptt: "F9",
  toggleWindow: "Cmd+Shift+H",
  teleprompter: "F10",
  moveWindow: "Cmd",
  resizeWindow: "Cmd+Shift",
  scrollChat: "Alt",
};

describe("formatCombo", () => {
  it("сворачивает модификаторы в mac-символы", () => {
    expect(formatCombo("Cmd+Shift+H")).toBe("⌘⇧H");
    expect(formatCombo("Ctrl+Alt+P")).toBe("⌃⌥P");
  });

  it("сворачивает спеку из одних модификаторов, без клавиши на конце", () => {
    expect(formatCombo("Cmd")).toBe("⌘");
    expect(formatCombo("Cmd+Shift")).toBe("⌘⇧");
    expect(formatCombo("Alt")).toBe("⌥");
    expect(formatCombo("Ctrl+Shift")).toBe("⌃⇧");
  });

  it("не трогает одиночные клавиши", () => {
    expect(formatCombo("F9")).toBe("F9");
  });
});

describe("comboTokens", () => {
  it("модификаторы и стрелки становятся иконками, буквы — текстом", () => {
    expect(comboTokens("⌘⇧H")).toEqual([
      { type: "icon", icon: "cmd" },
      { type: "icon", icon: "shift" },
      { type: "text", text: "H" },
    ]);
  });

  it("текстовые клавиши склеиваются, пробелы выбрасываются", () => {
    expect(comboTokens("F9")).toEqual([{ type: "text", text: "F9" }]);
    expect(comboTokens("⌘⇧ + −")).toEqual([
      { type: "icon", icon: "cmd" },
      { type: "icon", icon: "shift" },
      { type: "icon", icon: "plus" },
      { type: "icon", icon: "minus" },
    ]);
  });
});

describe("hotkeyGroups", () => {
  it("настраиваемые хоткеи берутся из конфига и форматируются", () => {
    const combos = hotkeyGroups(CFG)
      .flatMap((g) => g.hints)
      .map((h) => h.combo);
    expect(combos).toContain("F9");
    expect(combos).toContain("⌘⇧H");
    expect(combos).toContain("F10");
    expect(combos).toContain("⌘ ←→↑↓");
    expect(combos).toContain("⌘⇧ ←→↑↓");
    expect(combos).toContain("⌥ ↑↓");
  });

  it("каждая группа названа и непуста", () => {
    for (const group of hotkeyGroups(CFG)) {
      expect(group.title).not.toBe("");
      expect(group.hints.length).toBeGreaterThan(0);
    }
  });

  it("подписи и комбо не пустые", () => {
    for (const hint of hotkeyGroups(CFG).flatMap((g) => g.hints)) {
      expect(hint.combo).not.toBe("");
      expect(hint.label).not.toBe("");
    }
  });
});
