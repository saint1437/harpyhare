import { describe, expect, it } from "vitest";
import { MODIFIER_COMBOS } from "@/ipc/bindings";
import { matchesModifier, parseModifier, type ModifierState } from "./hotkey-modifier";

const NONE: ModifierState = {
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
};

describe("matchesModifier", () => {
  it("matches a single modifier exactly", () => {
    expect(matchesModifier({ ...NONE, metaKey: true }, parseModifier("Cmd"))).toBe(true);
    expect(matchesModifier({ ...NONE, altKey: true }, parseModifier("Alt"))).toBe(true);
  });

  it("requires an exact set — extra modifier fails", () => {
    expect(matchesModifier({ ...NONE, metaKey: true, shiftKey: true }, parseModifier("Cmd"))).toBe(
      false,
    );
  });

  it("matches a combo and rejects a partial press", () => {
    expect(
      matchesModifier({ ...NONE, metaKey: true, shiftKey: true }, parseModifier("Cmd+Shift")),
    ).toBe(true);
    expect(matchesModifier({ ...NONE, metaKey: true }, parseModifier("Cmd+Shift"))).toBe(false);
  });

  it("rejects a different modifier", () => {
    expect(matchesModifier({ ...NONE, ctrlKey: true }, parseModifier("Cmd"))).toBe(false);
    expect(matchesModifier(NONE, parseModifier("Alt"))).toBe(false);
  });
});

describe("parseModifier", () => {
  it("разбирает спеку в набор флагов", () => {
    expect(parseModifier("Cmd+Shift")).toEqual({ ...NONE, metaKey: true, shiftKey: true });
    expect(parseModifier("Alt")).toEqual({ ...NONE, altKey: true });
  });

  it("неизвестные токены дают пустой набор", () => {
    expect(parseModifier("")).toEqual(NONE);
    expect(parseModifier("Fn")).toEqual(NONE);
  });

  it("каждое комбо из реестра Rust разбирается в непустой и уникальный набор флагов", () => {
    const seen = new Set<string>();
    for (const combo of MODIFIER_COMBOS) {
      const parsed = parseModifier(combo);
      expect(Object.values(parsed).some(Boolean)).toBe(true);
      expect(seen.has(JSON.stringify(parsed))).toBe(false);
      seen.add(JSON.stringify(parsed));
    }
  });
});
