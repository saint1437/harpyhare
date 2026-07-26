import { describe, expect, it } from "vitest";
import type { HotkeyBinding } from "@/ipc/types";
import { comboTokens, effectiveCombo, formatCombo, hotkeyGroups } from "./hotkeys";

const NO_BINDINGS: HotkeyBinding[] = [];

describe("formatCombo", () => {
  it("сворачивает модификаторы в mac-символы", () => {
    expect(formatCombo("Cmd+Shift+H")).toBe("⌘⇧H");
    expect(formatCombo("Ctrl+Alt+P")).toBe("⌃⌥P");
  });

  it("сворачивает спеку из одних модификаторов, без клавиши на конце", () => {
    expect(formatCombo("Cmd")).toBe("⌘");
    expect(formatCombo("Cmd+Shift")).toBe("⌘⇧");
  });

  it("именованные клавиши получают свои символы", () => {
    expect(formatCombo("Cmd+Enter")).toBe("⌘⏎");
    expect(formatCombo("Escape")).toBe("Esc");
    expect(formatCombo("Space")).toBe("␣");
    expect(formatCombo("Cmd+ArrowUp")).toBe("⌘↑");
    expect(formatCombo("Cmd+Minus")).toBe("⌘−");
  });

  it("длинная форма буквы читается как короткая", () => {
    expect(formatCombo("Cmd+KeyS")).toBe("⌘S");
    expect(formatCombo("Digit1")).toBe("1");
  });
});

describe("effectiveCombo", () => {
  it("без биндинга отдаёт дефолт действия", () => {
    expect(effectiveCombo(NO_BINDINGS, "record")).toBe("F9");
    expect(effectiveCombo(NO_BINDINGS, "teleprompter")).toBe("F10");
  });

  it("биндинг перекрывает дефолт, пустая строка значит «не назначен»", () => {
    expect(effectiveCombo([{ action: "record", combo: "Cmd+Shift+X" }], "record")).toBe(
      "Cmd+Shift+X",
    );
    expect(effectiveCombo([{ action: "record", combo: "" }], "record")).toBe("");
  });
});

describe("hotkeyGroups", () => {
  it("собирает подсказки из реестра и текущих биндингов", () => {
    const combos = hotkeyGroups(NO_BINDINGS)
      .flatMap((g) => g.hints)
      .map((h) => h.combo);
    expect(combos).toContain("F9");
    expect(combos).toContain("⌘⇧H");
    expect(combos).toContain("⌘ ←→↑↓");
    expect(combos).toContain("⌘⇧ + −");
    expect(combos).toContain("⌥ ←→↑↓");
  });

  it("переназначенное действие показывается новым сочетанием", () => {
    const combos = hotkeyGroups([{ action: "record", combo: "Cmd+Shift+X" }])
      .flatMap((g) => g.hints)
      .map((h) => h.combo);
    expect(combos).toContain("⌘⇧X");
    expect(combos).not.toContain("F9");
  });

  it("не назначенное действие в справочник не попадает", () => {
    const labels = hotkeyGroups([{ action: "teleprompter", combo: "" }])
      .flatMap((g) => g.hints)
      .map((h) => h.label);
    expect(labels).not.toContain("суфлёр");
  });

  it("каждая группа названа и непуста, подписи и комбо заполнены", () => {
    for (const group of hotkeyGroups(NO_BINDINGS)) {
      expect(group.title).not.toBe("");
      expect(group.hints.length).toBeGreaterThan(0);
      for (const hint of group.hints) {
        expect(hint.combo).not.toBe("");
        expect(hint.label).not.toBe("");
      }
    }
  });
});

describe("comboTokens", () => {
  it("модификаторы разбираются в иконки", () => {
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
