import { describe, expect, it } from "vitest";
import { conflictsWithTyping, hotkeyFromEvent } from "./hotkey-capture";

const base = { metaKey: false, ctrlKey: false, altKey: false, shiftKey: false };

describe("hotkeyFromEvent", () => {
  it("одиночная буква", () => {
    expect(hotkeyFromEvent({ ...base, code: "KeyV" })).toBe("V");
  });
  it("F-клавиша", () => {
    expect(hotkeyFromEvent({ ...base, code: "F9" })).toBe("F9");
  });
  it("цифра с модификатором", () => {
    expect(hotkeyFromEvent({ ...base, ctrlKey: true, code: "Digit1" })).toBe("Ctrl+1");
  });
  it("комбо с несколькими модификаторами в фиксированном порядке", () => {
    expect(hotkeyFromEvent({ ...base, metaKey: true, shiftKey: true, code: "KeyR" })).toBe(
      "Cmd+Shift+R",
    );
    expect(
      hotkeyFromEvent({ metaKey: true, ctrlKey: true, altKey: true, shiftKey: true, code: "KeyA" }),
    ).toBe("Cmd+Ctrl+Alt+Shift+A");
  });
  it("только модификаторы → null", () => {
    expect(hotkeyFromEvent({ ...base, metaKey: true, code: "MetaLeft" })).toBeNull();
    expect(hotkeyFromEvent({ ...base, shiftKey: true, code: "ShiftLeft" })).toBeNull();
  });
  it("нераспознанный код → null", () => {
    expect(hotkeyFromEvent({ ...base, code: "Space" })).toBeNull();
  });
});

describe("conflictsWithTyping", () => {
  it("одиночная буква/цифра мешает печати (в т.ч. с Shift)", () => {
    expect(conflictsWithTyping("V")).toBe(true);
    expect(conflictsWithTyping("1")).toBe(true);
    expect(conflictsWithTyping("Shift+V")).toBe(true);
  });
  it("F-клавиши и комбинации с Cmd/Ctrl/Alt печати не мешают", () => {
    expect(conflictsWithTyping("F9")).toBe(false);
    expect(conflictsWithTyping("F12")).toBe(false);
    expect(conflictsWithTyping("Cmd+V")).toBe(false);
    expect(conflictsWithTyping("Ctrl+1")).toBe(false);
    expect(conflictsWithTyping("Alt+R")).toBe(false);
    expect(conflictsWithTyping("Cmd+Shift+R")).toBe(false);
  });
});
