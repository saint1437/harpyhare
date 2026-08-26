import { describe, expect, it } from "vitest";
import { PERMISSION_ROWS } from "@/features/settings/permission-rows";
import { dictionary, LOCALES } from "@/i18n";
import type { Dictionary } from "@/i18n/types";
import { PLATFORMS } from "@/lib/platform";
import { LAUNCHER_SCREENS, screenCopy } from "./screens";
import { WINDOW_PAIRS } from "./window-pairs";

/**
 * The dictionary is exhaustive by the compiler — every record here is keyed by a
 * union, so a missing entry is a `tsc` failure. What the compiler cannot see is
 * an entry that EXISTS and says nothing: `""` type-checks and reaches the screen
 * as a blank label. These cases walk both locales for exactly that.
 */
function entries(copy: Record<string, string>): [string, string][] {
  return Object.entries(copy);
}

/** Every leaf of the namespace, as `path → text`. */
function leaves(node: unknown, path: string[] = []): [string, string][] {
  if (typeof node === "string") return [[path.join("."), node]];
  if (node === null || typeof node !== "object") return [];
  return Object.entries(node).flatMap(([key, value]) => leaves(value, [...path, key]));
}

const CYRILLIC = /\p{Script=Cyrillic}/u;

describe.each(LOCALES)("launcher copy (%s)", (locale) => {
  const dict: Dictionary = dictionary(locale);

  it("каждый экран реестра назван и описан", () => {
    for (const screen of LAUNCHER_SCREENS) {
      const copy = screenCopy(screen.id, dict);
      expect(copy.label.trim(), screen.id).not.toBe("");
      expect(copy.description.trim(), screen.id).not.toBe("");
    }
  });

  it("у каждого состояния шага старта есть слово", () => {
    for (const [state, text] of entries(dict.launcher.start.stepStates)) {
      expect(text.trim(), state).not.toBe("");
    }
  });

  it("у каждого источника проверки звука есть подпись и пояснение", () => {
    for (const [source, copy] of Object.entries(dict.launcher.audioCheck.sources)) {
      expect(copy.label.trim(), source).not.toBe("");
      expect(copy.hint.trim(), source).not.toBe("");
    }
  });

  it("у каждого состояния доступа есть слово", () => {
    for (const [state, text] of entries(dict.launcher.permissions.states)) {
      expect(text.trim(), state).not.toBe("");
    }
  });

  it("у каждой пары «модификатор и шаг» есть пояснение", () => {
    for (const pair of WINDOW_PAIRS) {
      expect(dict.launcher.window.pairs[pair.action].trim(), pair.action).not.toBe("");
    }
  });

  it("файловый менеджер назван на обеих платформах", () => {
    for (const platform of PLATFORMS) {
      expect(dict.launcher.contexts.fileManager[platform].trim(), platform).not.toBe("");
    }
  });

  // The three registries the launcher renders but does not own: a launcher screen
  // with an untranslated permission row or step is just as blank as one of ours.
  it("строки доступов, которые рисует лаунчер, переведены", () => {
    for (const row of PERMISSION_ROWS) {
      const copy = dict.settings.permissions.rows[row.kind];
      expect(copy.title.trim(), row.kind).not.toBe("");
      expect(copy.purpose.trim(), row.kind).not.toBe("");
      expect(dict.settings.permissions.needs[row.need].trim(), row.need).not.toBe("");
    }
  });
});

/**
 * The one form of "untranslated" a per-locale walk cannot see on its own: a key
 * that EXISTS in `en` and still holds the Russian sentence it was copied from.
 * Nothing in the launcher's copy is a proper name in another script, so a
 * Cyrillic character in the English namespace is always a missed translation.
 */
describe("launcher copy (en)", () => {
  it("в английском словаре не осталось кириллицы", () => {
    for (const [path, text] of leaves(dictionary("en").launcher)) {
      expect(CYRILLIC.test(text), path).toBe(false);
    }
  });

  it("ни одна строка ни в одном языке не пуста", () => {
    for (const locale of LOCALES) {
      const found = leaves(dictionary(locale).launcher);
      expect(found.length).toBeGreaterThan(0);
      for (const [path, text] of found) expect(text.trim(), `${locale}.${path}`).not.toBe("");
    }
  });
});
