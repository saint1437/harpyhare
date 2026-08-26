import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyLanguage, getDict } from "@/i18n";
import { errorTitle } from "@/i18n/errors";
import type { AppError } from "./errors";
import {
  DETAIL_CLAMP_CHARS,
  dismissAllNotifications,
  dismissNotification,
  getNotifications,
  hasFailureNotification,
  isDetailClamped,
  notificationAnnouncement,
  notificationBody,
  notificationLifetime,
  notify,
  notifyAppError,
  notifyError,
  notifySuccess,
  NOTIFICATION_LIMIT,
  pauseNotifications,
  resumeNotifications,
  stackNotifications,
  subscribeNotifications,
  type AppNotification,
} from "./notifications";

const item = (over: Partial<AppNotification> = {}): AppNotification => ({
  id: "a",
  tone: "danger",
  title: "Заголовок",
  detail: "тело",
  count: 1,
  lifetimeMs: 1000,
  ...over,
});

describe("notificationLifetime", () => {
  it("длинному сообщению даёт больше времени, чем короткому", () => {
    const short = notificationLifetime("danger", "Сбой", "нет");
    const long = notificationLifetime("danger", "Сбой", "x".repeat(DETAIL_CLAMP_CHARS));
    expect(long).toBeGreaterThan(short);
  });

  // Ровно то, ради чего затевалась обрезка: невидимые символы не покупают
  // экранное время, иначе стектрейс на 4 КБ висел бы минутами.
  it("не платит за то, что всё равно скрыто под «Подробнее»", () => {
    const clamped = notificationLifetime("danger", "Сбой", "x".repeat(DETAIL_CLAMP_CHARS));
    const huge = notificationLifetime("danger", "Сбой", "x".repeat(50_000));
    expect(huge).toBe(clamped);
  });

  it("тревога висит дольше подтверждения", () => {
    expect(notificationLifetime("danger", "Т", "")).toBeGreaterThan(
      notificationLifetime("success", "Т", ""),
    );
  });
});

describe("notificationBody", () => {
  // Сообщения из Rust — целые фразы и часто начинаются теми же словами, что и
  // заголовок по коду: «Нет соединения» + «Нет соединения — проверь интернет».
  it("не повторяет заголовок в теле", () => {
    expect(notificationBody("Нет соединения", "Нет соединения — проверь интернет/VPN: dns")).toBe(
      "проверь интернет/VPN: dns",
    );
  });

  it("оставляет тело нетронутым, когда оно про другое", () => {
    expect(notificationBody("Нет доступа", "Нет разрешения на запись")).toBe(
      "Нет разрешения на запись",
    );
  });

  it("совпадение целиком оставляет тело пустым", () => {
    expect(notificationBody("Остановлено", "Остановлено")).toBe("");
  });
});

describe("notificationAnnouncement", () => {
  it("читает столько же, сколько видно на карточке, и не больше", () => {
    const said = notificationAnnouncement(item({ title: "Сбой", detail: "ж".repeat(10_000) }));
    expect(said.length).toBeLessThan(DETAIL_CLAMP_CHARS * 2);
    expect(said.startsWith("Сбой. ")).toBe(true);
    expect(said.endsWith("…")).toBe(true);
  });

  it("без тела читает один заголовок, без висящей точки", () => {
    expect(notificationAnnouncement(item({ title: "Код принят", detail: "" }))).toBe("Код принят");
  });
});

describe("notificationAnnouncement — повторы", () => {
  it("счётчик входит в текст: иначе aria-atomic не переобъявит то же самое", () => {
    const repeated = item({ title: "Ошибка сети", detail: "восстановите VPN", count: 3 });
    expect(notificationAnnouncement(repeated)).toContain("(повтор ×3)");
  });
});

describe("isDetailClamped", () => {
  it("считает обрезанным всё длинное и всё многострочное", () => {
    expect(isDetailClamped("коротко")).toBe(false);
    expect(isDetailClamped("две\nстроки")).toBe(true);
    expect(isDetailClamped("x".repeat(DETAIL_CLAMP_CHARS + 1))).toBe(true);
  });
});

describe("stackNotifications", () => {
  it("одинаковые схлопывает в счётчик, а не в стопку", () => {
    const once = stackNotifications([], item({ id: "1" }));
    const twice = stackNotifications(once, item({ id: "2" }));
    expect(twice).toHaveLength(1);
    expect(twice[0]?.count).toBe(2);
    // Идентичность держится за первой карточкой: иначе React пересоздал бы узел.
    expect(twice[0]?.id).toBe("1");
  });

  it("разные копит, но не больше предела — старые выпадают", () => {
    const list = ["a", "b", "c", "d"].reduce<AppNotification[]>(
      (acc, title, i) => stackNotifications(acc, item({ id: String(i), title })),
      [],
    );
    expect(list).toHaveLength(NOTIFICATION_LIMIT);
    expect(list.map((n) => n.title)).toEqual(["b", "c", "d"]);
  });
});

describe("хранилище", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    dismissAllNotifications();
  });
  afterEach(() => {
    dismissAllNotifications();
    vi.useRealTimers();
  });

  // Отсчёт идёт тиками по 200 мс, поэтому проверяется «ещё здесь» до срока и
  // «уже нет» после, а не попадание в саму миллисекунду.
  it("уведомление живёт отведённое время и уходит само", () => {
    notifySuccess("Готово");
    const lifetime = getNotifications()[0]?.lifetimeMs ?? 0;
    expect(lifetime).toBeGreaterThan(0);
    vi.advanceTimersByTime(lifetime - 1000);
    expect(getNotifications()).toHaveLength(1);
    vi.advanceTimersByTime(2000);
    expect(getNotifications()).toHaveLength(0);
  });

  it("пауза держит его на экране, снятие паузы отпускает", () => {
    notifyError("Сбой");
    const lifetime = getNotifications()[0]?.lifetimeMs ?? 0;
    pauseNotifications();
    vi.advanceTimersByTime(lifetime * 3);
    expect(getNotifications()).toHaveLength(1);
    resumeNotifications();
    vi.advanceTimersByTime(lifetime * 2);
    expect(getNotifications()).toHaveLength(0);
  });

  it("повтор перезапускает отсчёт, а не продлевает старый", () => {
    notifyError("Сбой");
    const lifetime = getNotifications()[0]?.lifetimeMs ?? 0;
    vi.advanceTimersByTime(lifetime - 200);
    notifyError("Сбой");
    expect(getNotifications()[0]?.count).toBe(2);
    vi.advanceTimersByTime(lifetime - 200);
    expect(getNotifications()).toHaveLength(1);
  });

  it("подписчик узнаёт о появлении и о снятии", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeNotifications(listener);
    notifyError("Сбой");
    const id = getNotifications()[0]?.id ?? "";
    dismissNotification(id);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(getNotifications()).toHaveLength(0);
    unsubscribe();
    notifyError("Другой");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("снимок не пересоздаётся, пока ничего не изменилось", () => {
    notifyError("Сбой");
    const first = getNotifications();
    vi.advanceTimersByTime(200);
    expect(getNotifications()).toBe(first);
  });
});

describe("hasFailureNotification", () => {
  // Строка захвата и клубок спрашивают «что-то сломалось?», а перегруженный
  // провайдер — такой же отказ, как неверный ключ.
  it("считает отказом и тревогу, и предупреждение, но не подтверждение", () => {
    expect(hasFailureNotification([item({ tone: "success" })])).toBe(false);
    expect(hasFailureNotification([item({ tone: "warning" })])).toBe(true);
    expect(hasFailureNotification([item({ tone: "danger" })])).toBe(true);
    expect(hasFailureNotification([])).toBe(false);
  });
});

describe("notifyAppError", () => {
  const err = (code: AppError["code"]): AppError => ({ code, message: "подробности" });

  beforeEach(dismissAllNotifications);
  afterEach(dismissAllNotifications);

  it("берёт заголовок и текст из кода, а не из русской фразы Rust", () => {
    notifyAppError({ code: "badApiKey", message: "подробности", params: { provider: "Groq" } });
    expect(getNotifications()[0]?.title).toBe(errorTitle("badApiKey", getDict()));
    expect(getNotifications()[0]?.detail).toBe("Проверьте ключ Groq в настройках.");
  });

  it("параметры подставляются в шаблон словаря", () => {
    notifyAppError({
      code: "modelNotAllowed",
      message: "Модель недоступна",
      params: { model: "gpt-4o" },
    });
    expect(getNotifications()[0]?.detail).toContain("gpt-4o");
  });

  // Совместимость в обратную сторону: код без своего текста и без параметров
  // печатает то единственное, что прислал Rust, — русскую фразу.
  it("пустой шаблон откатывается на message", () => {
    notifyAppError({ code: "api", message: "чужая фраза" });
    expect(getNotifications()[0]?.detail).toBe("чужая фраза");
  });

  it("тот же код на английском даёт английский текст", () => {
    applyLanguage("en");
    notifyAppError({ code: "badApiKey", message: "подробности", params: { provider: "Groq" } });
    expect(getNotifications()[0]?.title).toBe("Key rejected");
    expect(getNotifications()[0]?.detail).toBe("Check your Groq key in settings.");
    applyLanguage("ru");
  });

  // «Подожди и повтори» — не отказ приложения, и тон у него другой.
  it("сеть и перегрузку помечает предупреждением, остальное — тревогой", () => {
    notifyAppError(err("network"));
    notifyAppError(err("retryable"));
    notifyAppError(err("api"));
    expect(getNotifications().map((n) => n.tone)).toEqual(["warning", "warning", "danger"]);
  });

  // Отмену запросил сам человек: сообщать ему об этом нечего.
  it("отмену не показывает вовсе", () => {
    notifyAppError(err("cancelled"));
    expect(getNotifications()).toHaveLength(0);
  });
});

describe("notify", () => {
  beforeEach(dismissAllNotifications);
  afterEach(dismissAllNotifications);

  it("без тела оставляет пустую строку, а не undefined", () => {
    notify({ tone: "warning", title: "Только заголовок" });
    expect(getNotifications()[0]?.detail).toBe("");
  });
});
