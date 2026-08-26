import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyLanguage,
  dictionary,
  getDict,
  getLocale,
  resolveLocale,
  subscribeDictionary,
} from ".";

/**
 * `system` is answered on the frontend, from `navigator.language` — the same
 * rule `lib/platform.ts` follows for the platform, and for the same reason: a
 * value that came from Rust would split `bindings.ts` between build hosts.
 */
describe("resolveLocale", () => {
  it("явный выбор перебивает систему", () => {
    expect(resolveLocale("ru", "en-US")).toBe("ru");
    expect(resolveLocale("en", "ru-RU")).toBe("en");
  });

  it.each([
    ["ru", "ru"],
    ["ru-RU", "ru"],
    ["RU-ru", "ru"],
    ["ru-BY", "ru"],
    ["en", "en"],
    ["en-GB", "en"],
    ["en-US", "en"],
  ])("system + navigator.language=%s → %s", (tag, expected) => {
    expect(resolveLocale("system", tag)).toBe(expected);
  });

  // Ни русский, ни английский: выбирать всё равно приходится, и английский —
  // та из двух, которую скорее прочтут. Русский тут был бы догадкой хуже.
  it.each(["fr-FR", "de", "pl", "zh-Hans", "", "   ", "xx-YY"])(
    "неизвестный язык %s уходит в английский",
    (tag) => {
      expect(resolveLocale("system", tag)).toBe("en");
    },
  );

  it("мусор в настройке лечится системой, а не падением", () => {
    expect(resolveLocale("klingon", "ru-RU")).toBe("ru");
    expect(resolveLocale("", "en-GB")).toBe("en");
  });
});

describe("applyLanguage", () => {
  it("переключает текущий словарь и возвращает разрешённую локаль", () => {
    try {
      expect(applyLanguage("en", "ru-RU")).toBe("en");
      expect(getLocale()).toBe("en");
      expect(getDict()).toBe(dictionary("en"));
      expect(applyLanguage("system", "ru-RU")).toBe("ru");
      expect(getDict()).toBe(dictionary("ru"));
    } finally {
      applyLanguage("ru");
    }
  });

  it("повторный вызов с той же локалью подписчиков не будит", () => {
    applyLanguage("ru");
    let woken = 0;
    const stop = subscribeDictionary(() => {
      woken += 1;
    });
    try {
      applyLanguage("ru");
      expect(woken).toBe(0);
      applyLanguage("en");
      expect(woken).toBe(1);
    } finally {
      stop();
      applyLanguage("ru");
    }
  });
});

// Найдено запуском приложения: macOS на английском, приложение на русском —
// и HUD, который создаётся по требованию, каждый раз показывал английский до
// прихода настроек.
describe("локаль переживает перезапуск окна", () => {
  beforeEach(() => {
    localStorage.clear();
    applyLanguage("ru", "en-US");
  });

  it("следующая загрузка стартует с языка приложения, а не системы", () => {
    // Ровно то, что делает render-root: без аргументов, до прихода настроек.
    expect(applyLanguage(undefined, "en-US")).toBe("ru");
  });

  it("первая в жизни загрузка всё ещё берёт язык системы", () => {
    localStorage.clear();
    expect(applyLanguage(undefined, "en-US")).toBe("en");
  });

  it("настройки остаются последним словом", () => {
    expect(applyLanguage("en", "en-US")).toBe("en");
    expect(applyLanguage(undefined, "ru-RU")).toBe("en");
  });

  it("недоступный localStorage не ломает загрузку", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("site data blocked");
    });
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("site data blocked");
    });
    expect(applyLanguage(undefined, "ru-RU")).toBe("ru");
    getItem.mockRestore();
    setItem.mockRestore();
  });
});
