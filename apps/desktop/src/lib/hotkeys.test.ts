import { describe, expect, it } from "vitest";
import { formatCombo, hotkeyGroups } from "./hotkeys";

const CFG = { ptt: "F9", toggleWindow: "Cmd+Shift+H", teleprompter: "F10" };

describe("formatCombo", () => {
  it("сворачивает модификаторы в mac-символы", () => {
    expect(formatCombo("Cmd+Shift+H")).toBe("⌘⇧H");
    expect(formatCombo("Ctrl+Alt+P")).toBe("⌃⌥P");
  });

  it("не трогает одиночные клавиши", () => {
    expect(formatCombo("F9")).toBe("F9");
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
