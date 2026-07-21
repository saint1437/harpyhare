import { describe, expect, it } from "vitest";
import { hotkeyGroups } from "./hotkeys";

const CFG = { ptt: "F9", toggleWindow: "Cmd+Shift+H", teleprompter: "F10" };

describe("hotkeyGroups", () => {
  it("настраиваемые хоткеи берутся из конфига", () => {
    const combos = hotkeyGroups(CFG)
      .flatMap((g) => g.hints)
      .map((h) => h.combo);
    expect(combos).toContain("F9");
    expect(combos).toContain("Cmd+Shift+H");
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
