import { describe, expect, it } from "vitest";
import { dictionary, LOCALES, type Dictionary } from "@/i18n";

/**
 * The HUD's records are keyed by unions the app already has — the orb's state,
 * and the two indicators' on/off. The compiler therefore demands a key from
 * every locale; what it cannot demand is that the key carry a WORD, and an
 * empty string is exactly what a hurried translation leaves behind. A blank
 * `aria-label` on the orb is a button a screen reader cannot name at all.
 */
const RECORDS: { name: string; of: (dict: Dictionary) => Record<string, unknown> }[] = [
  { name: "hud.orb.labels", of: (d) => d.hud.orb.labels },
  { name: "hud.autoMode.states", of: (d) => d.hud.autoMode.states },
  { name: "hud.screenShare.states", of: (d) => d.hud.screenShare.states },
];

/** `{label, action}` pairs count as two strings, not as one non-empty object. */
function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  return Object.values(value as Record<string, unknown>).flatMap(strings);
}

describe("словарь HUD", () => {
  it.each(RECORDS)("$name заполнен на обоих языках", ({ of }) => {
    for (const locale of LOCALES) {
      const record = of(dictionary(locale));
      expect(Object.keys(record).length).toBeGreaterThan(0);
      for (const [key, value] of Object.entries(record)) {
        for (const text of strings(value)) {
          expect(text.trim(), `${locale}: ${key}`).not.toBe("");
        }
      }
    }
  });

  it.each(RECORDS)("$name описывает одни и те же состояния на обоих языках", ({ of }) => {
    const [first, ...rest] = LOCALES.map((locale) => Object.keys(of(dictionary(locale))).sort());
    for (const keys of rest) expect(keys).toEqual(first);
  });
});
