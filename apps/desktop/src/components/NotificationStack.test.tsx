import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DETAIL_CLAMP_CHARS, dismissAllNotifications, notifyError } from "@/lib/notifications";
import { NotificationCard } from "./NotificationCard";
import { NotificationStack } from "./NotificationStack";

afterEach(() => {
  cleanup();
  dismissAllNotifications();
});

const HUGE_DETAIL = "ж".repeat(DETAIL_CLAMP_CHARS * 4);

function firstExpandButton(): HTMLElement {
  const [button] = screen.getAllByText("Подробнее");
  if (!button) throw new Error("кнопка «Подробнее» не найдена");
  return button;
}

describe("NotificationStack", () => {
  // Живая область висит всегда (вставленная одновременно со своим текстом, она
  // объявляется ненадёжно), а видимый контейнер — нет: пустой flex-элемент всё
  // равно съедал бы `gap` из колонки обоих окон.
  it("пустая стопка держит живую область, но ничего не занимает в потоке", () => {
    const { container } = render(<NotificationStack className="stack-under-test" />);
    expect(container.querySelector("[aria-live]")).not.toBeNull();
    expect(container.querySelector(".stack-under-test")).toBeNull();
  });

  it("показывает поднятое из любого места уведомление", () => {
    render(<NotificationStack />);
    act(() => {
      notifyError("Не удалось сохранить настройки", "диск заполнен");
    });
    expect(screen.getByText("Не удалось сохранить настройки")).not.toBeNull();
    expect(screen.getByText("диск заполнен")).not.toBeNull();
  });

  it("одинаковые отказы сходятся в одну карточку со счётчиком", () => {
    render(<NotificationStack />);
    act(() => {
      notifyError("Ошибка сервиса", "500");
      notifyError("Ошибка сервиса", "500");
    });
    expect(screen.getAllByText("Ошибка сервиса")).toHaveLength(1);
    expect(screen.getByText("×2")).not.toBeNull();
  });

  it("крестик по последней карточке не замораживает следующую", () => {
    // Dismissing the last card removes the container from under the pointer;
    // mouseleave never fires for a removed node, and a stale hover kept the
    // store paused — the next notification arrived with its countdown parked.
    render(<NotificationStack className="stack-under-test" />);
    act(() => {
      notifyError("Первый отказ");
    });
    const container = document.querySelector(".stack-under-test");
    if (!container) throw new Error("контейнер стопки не найден");
    fireEvent.mouseEnter(container);
    fireEvent.click(screen.getByTitle("Закрыть уведомление"));
    act(() => {
      notifyError("Второй отказ");
    });
    const bar = document.querySelector(".notification-life");
    expect(bar?.getAttribute("style")).toContain("animation-play-state: running");
  });

  it("крестик снимает карточку", () => {
    render(<NotificationStack />);
    act(() => {
      notifyError("Ошибка сервиса", "500");
    });
    fireEvent.click(screen.getByLabelText("Закрыть уведомление"));
    expect(screen.queryByText("Ошибка сервиса")).toBeNull();
  });

  // То, ради чего всё затевалось: сообщение длиной в экран не растягивает окно,
  // а раскрывается по требованию.
  it("огромный текст сначала свёрнут, «Подробнее» его раскрывает", () => {
    render(<NotificationStack />);
    act(() => {
      notifyError("Ошибка сервиса", HUGE_DETAIL);
    });
    const body = screen.getByText(HUGE_DETAIL);
    expect(body.className).toContain("line-clamp-2");
    fireEvent.click(screen.getByText("Подробнее"));
    expect(screen.getByText(HUGE_DETAIL).className).toContain("overflow-y-auto");
    expect(screen.getByText("Свернуть")).not.toBeNull();
  });

  // Раскрыт может быть только один: «читают ли сейчас» — это один id, а не
  // множество, которое пришлось бы чистить на каждом истечении.
  it("раскрытие второй карточки сворачивает первую", () => {
    render(<NotificationStack />);
    act(() => {
      notifyError("Первая", HUGE_DETAIL);
      notifyError("Вторая", HUGE_DETAIL);
    });
    expect(screen.getAllByText("Подробнее")).toHaveLength(2);
    fireEvent.click(firstExpandButton());
    expect(screen.getAllByText("Подробнее")).toHaveLength(1);
    fireEvent.click(firstExpandButton());
    expect(screen.getAllByText("Подробнее")).toHaveLength(1);
    expect(screen.getAllByText("Свернуть")).toHaveLength(1);
  });
});

describe("NotificationCard", () => {
  it("копирует заголовок вместе с полным текстом, а не то, что видно", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<NotificationCard tone="danger" title="Ошибка сервиса" detail={HUGE_DETAIL} />);
    fireEvent.click(screen.getByText("Копировать"));
    expect(writeText).toHaveBeenCalledWith(`Ошибка сервиса\n${HUGE_DETAIL}`);
    expect(await screen.findByText("Скопировано")).not.toBeNull();
  });

  // Приколотая карточка — та же самая: у обновления «Повторить» стоит рядом, и
  // уносить причину от кнопки нельзя.
  it("без onDismiss не показывает ни крестика, ни полосы жизни", () => {
    const { container } = render(<NotificationCard tone="danger" title="Сбой" detail="текст" />);
    expect(screen.queryByLabelText("Закрыть уведомление")).toBeNull();
    expect(container.querySelector(".notification-life")).toBeNull();
  });

  it("тон несёт не только цветом: у каждого свой глиф со словом", () => {
    const { rerender } = render(<NotificationCard tone="danger" title="Т" detail="" />);
    expect(screen.getByText("Ошибка")).not.toBeNull();
    rerender(<NotificationCard tone="warning" title="Т" detail="" />);
    expect(screen.getByText("Предупреждение")).not.toBeNull();
    rerender(<NotificationCard tone="success" title="Т" detail="" />);
    expect(screen.getByText("Готово")).not.toBeNull();
  });
});
