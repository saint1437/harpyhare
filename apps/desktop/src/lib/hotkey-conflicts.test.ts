import { describe, expect, it } from "vitest";
import type { HotkeyBinding } from "@/ipc/types";
import { assignHotkey, hotkeysConflict, resetHotkey } from "./hotkey-conflicts";
import { effectiveCombo } from "./hotkeys";

const NO_BINDINGS: HotkeyBinding[] = [];

describe("hotkeysConflict — зеркало правил из Rust", () => {
  it("порядок и регистр модификаторов не важны", () => {
    expect(hotkeysConflict("record", "Cmd+Shift+X", "send", "Shift+Cmd+X")).toBe(true);
    expect(hotkeysConflict("record", "cmd+x", "send", "Cmd+KeyX")).toBe(true);
    expect(hotkeysConflict("record", "Cmd+X", "send", "Cmd+Y")).toBe(false);
  });

  it("семейства стрелок и плюс-минуса делят модификатор без конфликта", () => {
    expect(hotkeysConflict("resize_window", "Cmd+Shift", "opacity", "Cmd+Shift")).toBe(false);
    expect(hotkeysConflict("resize_window", "Cmd+Shift", "scroll_chat", "Cmd+Shift")).toBe(true);
  });

  it("семейство цифр делит модификатор с другими семействами, но спорит за цифры", () => {
    expect(hotkeysConflict("quick_action", "Cmd", "move_window", "Cmd")).toBe(false);
    expect(hotkeysConflict("quick_action", "Cmd+Shift", "opacity", "Cmd+Shift")).toBe(false);
    expect(hotkeysConflict("send", "Cmd+1", "quick_action", "Cmd")).toBe(true);
    expect(hotkeysConflict("send", "Cmd+Digit9", "quick_action", "Cmd")).toBe(true);
    expect(hotkeysConflict("send", "Cmd+0", "quick_action", "Cmd")).toBe(false);
    expect(hotkeysConflict("send", "Cmd+Enter", "quick_action", "Cmd")).toBe(false);
  });

  it("сочетание конфликтует с семейством, в которое попадает", () => {
    expect(hotkeysConflict("send", "Cmd+ArrowUp", "move_window", "Cmd")).toBe(true);
    expect(hotkeysConflict("send", "Cmd+Shift+Minus", "opacity", "Cmd+Shift")).toBe(true);
    expect(hotkeysConflict("send", "Cmd+Enter", "move_window", "Cmd")).toBe(false);
  });

  it("запись и суфлёр не сосуществуют, поэтому Esc у обоих допустим", () => {
    expect(hotkeysConflict("cancel_recording", "Escape", "teleprompter_close", "Escape")).toBe(
      false,
    );
    expect(hotkeysConflict("cancel_recording", "Escape", "toggle_window", "Escape")).toBe(true);
  });

  it("пустое сочетание значит «не назначено» и ни с чем не спорит", () => {
    expect(hotkeysConflict("record", "", "send", "")).toBe(false);
    expect(hotkeysConflict("record", "", "send", "Cmd+Enter")).toBe(false);
  });
});

describe("assignHotkey", () => {
  it("совпадающее с дефолтом не хранится в биндингах", () => {
    const { bindings } = assignHotkey(NO_BINDINGS, "record", "F9");
    expect(bindings).toEqual([]);
    expect(effectiveCombo(bindings, "record")).toBe("F9");
  });

  it("отбирает сочетание у прежнего владельца и называет его", () => {
    const { bindings, stolenFrom } = assignHotkey(NO_BINDINGS, "send", "F10");
    expect(stolenFrom).toEqual(["teleprompter"]);
    expect(effectiveCombo(bindings, "send")).toBe("F10");
    expect(effectiveCombo(bindings, "teleprompter")).toBe("");
  });

  it("отбирает и у явно назначенного действия", () => {
    const first = assignHotkey(NO_BINDINGS, "record", "Cmd+Shift+X").bindings;
    const { bindings, stolenFrom } = assignHotkey(first, "toggle_window", "Cmd+Shift+X");
    expect(stolenFrom).toEqual(["record"]);
    expect(effectiveCombo(bindings, "record")).toBe("");
    expect(effectiveCombo(bindings, "toggle_window")).toBe("Cmd+Shift+X");
  });

  it("модификатор семейства отбирается так же, как обычное сочетание", () => {
    const { bindings, stolenFrom } = assignHotkey(NO_BINDINGS, "scroll_chat", "Cmd");
    expect(stolenFrom).toEqual(["move_window"]);
    expect(effectiveCombo(bindings, "move_window")).toBe("");
    expect(effectiveCombo(bindings, "scroll_chat")).toBe("Cmd");
  });

  it("не трогает действия, которые не пересекаются", () => {
    const { bindings, stolenFrom } = assignHotkey(NO_BINDINGS, "record", "Cmd+Shift+J");
    expect(stolenFrom).toEqual([]);
    expect(effectiveCombo(bindings, "toggle_window")).toBe("Cmd+Shift+H");
  });
});

describe("resetHotkey", () => {
  it("возвращает дефолт и убирает биндинг", () => {
    const changed = assignHotkey(NO_BINDINGS, "record", "Cmd+Shift+J").bindings;
    const { bindings } = resetHotkey(changed, "record");
    expect(bindings).toEqual([]);
    expect(effectiveCombo(bindings, "record")).toBe("F9");
  });

  it("возврат дефолта отбирает его у того, кто успел занять", () => {
    const stolen = assignHotkey(NO_BINDINGS, "send", "F9").bindings;
    expect(effectiveCombo(stolen, "record")).toBe("");
    const { bindings, stolenFrom } = resetHotkey(stolen, "record");
    expect(stolenFrom).toEqual(["send"]);
    expect(effectiveCombo(bindings, "record")).toBe("F9");
    expect(effectiveCombo(bindings, "send")).toBe("");
  });
});
