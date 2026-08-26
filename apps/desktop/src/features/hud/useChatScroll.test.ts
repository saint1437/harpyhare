import { act, cleanup, renderHook } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ScrollMetrics } from "@/lib/chat-scroll";
import type { ChatMessage } from "@/lib/chats";
import { useChatScroll, type ChatScroller } from "./useChatScroll";

/**
 * A scroll container that reports whatever the case wants and records every
 * jump. jsdom has no layout — every real `scrollHeight` here would be zero —
 * so the invariants are tested through the DECISIONS the hook takes, which is
 * also what keeps them true if a virtualiser ever owns the container.
 */
function fakeScroller(initial: ScrollMetrics) {
  let geometry = initial;
  const jumps = vi.fn();
  const scroller: ChatScroller = {
    toBottom: () => {
      jumps();
      geometry = { ...geometry, scrollTop: geometry.scrollHeight - geometry.clientHeight };
    },
    metrics: () => geometry,
  };
  return {
    scroller,
    jumps,
    setGeometry: (next: ScrollMetrics) => {
      geometry = next;
    },
  };
}

const AT_TOP: ScrollMetrics = { scrollTop: 0, scrollHeight: 1000, clientHeight: 200 };
const SHORT: ScrollMetrics = { scrollTop: 0, scrollHeight: 200, clientHeight: 200 };

function user(text: string): ChatMessage {
  return { role: "user", text, images: [] };
}

function assistant(text: string): ChatMessage {
  return { role: "assistant", text, images: [] };
}

interface Props {
  chatId: string;
  messages: ChatMessage[];
  partial: string | null;
}

function mount(scroller: ChatScroller, initial: Props) {
  return renderHook(
    (props: Props) => useChatScroll(scroller, props.chatId, props.messages, props.partial),
    { initialProps: initial },
  );
}

afterEach(cleanup);

describe("useChatScroll — доскролл вниз", () => {
  it("переключение чата доскроллит вниз", () => {
    const { scroller, jumps } = fakeScroller(AT_TOP);
    const messages = [user("вопрос"), assistant("ответ")];
    const { rerender } = mount(scroller, { chatId: "one", messages, partial: null });
    jumps.mockClear();
    rerender({ chatId: "two", messages, partial: null });
    expect(jumps).toHaveBeenCalledTimes(1);
  });

  // Пассивный эффект успевает показать кадр на прежней позиции — это и есть
  // «полёт сверху вниз», против которого layout-эффект существует.
  it("доскролл на переключении чата идёт ДО пассивных эффектов", () => {
    const { scroller } = fakeScroller(AT_TOP);
    const order: string[] = [];
    const messages = [user("вопрос")];
    const { rerender } = renderHook(
      (props: Props) => {
        const scroll = useChatScroll(
          {
            toBottom: () => {
              order.push("scroll");
            },
            metrics: scroller.metrics,
          },
          props.chatId,
          props.messages,
          props.partial,
        );
        useEffect(() => {
          order.push("passive");
        }, [props.chatId]);
        return scroll;
      },
      { initialProps: { chatId: "one", messages, partial: null } },
    );
    order.length = 0;
    rerender({ chatId: "two", messages, partial: null });
    expect(order[0]).toBe("scroll");
    expect(order).toContain("passive");
  });

  it("своё отправленное сообщение доскроллит вниз", () => {
    const { scroller, jumps } = fakeScroller(AT_TOP);
    const before = [assistant("ответ")];
    const { rerender } = mount(scroller, { chatId: "one", messages: before, partial: null });
    jumps.mockClear();
    rerender({ chatId: "one", messages: [...before, user("новый вопрос")], partial: null });
    expect(jumps).toHaveBeenCalledTimes(1);
  });

  it("дописанный ответ ассистента скролл не двигает", () => {
    const { scroller, jumps } = fakeScroller(AT_TOP);
    const before = [user("вопрос")];
    const { rerender } = mount(scroller, { chatId: "one", messages: before, partial: null });
    jumps.mockClear();
    rerender({ chatId: "one", messages: [...before, assistant("ответ")], partial: null });
    expect(jumps).not.toHaveBeenCalled();
  });
});

describe("useChatScroll — автоскролла во время стрима нет", () => {
  // Сознательное решение: прилипание к низу раздражало — скролл убегал и
  // останавливался только если проскроллить вверх руками.
  it("рост partial не двигает контейнер ни на один кадр", () => {
    const { scroller, jumps } = fakeScroller(AT_TOP);
    const messages = [user("вопрос")];
    const { rerender } = mount(scroller, { chatId: "one", messages, partial: "" });
    jumps.mockClear();
    for (const partial of ["О", "От", "Отв", "Отве", "Ответ"]) {
      rerender({ chatId: "one", messages, partial });
    }
    expect(jumps).not.toHaveBeenCalled();
  });

  it("рост partial меняет только видимость кнопки «↓ Вниз»", () => {
    const { scroller, setGeometry } = fakeScroller(SHORT);
    const messages = [user("вопрос")];
    const { result, rerender } = mount(scroller, { chatId: "one", messages, partial: "" });
    expect(result.current.showJump).toBe(false);
    // Ответ дорос до того, что в окно уже не помещается.
    setGeometry(AT_TOP);
    rerender({ chatId: "one", messages, partial: "длинный ответ" });
    expect(result.current.showJump).toBe(true);
  });
});

describe("useChatScroll — кнопка «↓ Вниз»", () => {
  it("на короткой истории кнопки нет", () => {
    const { scroller } = fakeScroller(SHORT);
    const { result } = mount(scroller, { chatId: "one", messages: [user("q")], partial: null });
    expect(result.current.showJump).toBe(false);
  });

  it("нажатие кнопки доскроллит и прячет её", () => {
    const { scroller, jumps, setGeometry } = fakeScroller(AT_TOP);
    const messages = [assistant("ответ")];
    const { result, rerender } = mount(scroller, { chatId: "one", messages, partial: "текст" });
    // Открытие чата уже увело контейнер вниз — уводим его обратно вверх, как
    // делает читатель, поднявшийся по истории.
    setGeometry(AT_TOP);
    rerender({ chatId: "one", messages, partial: "текст!" });
    expect(result.current.showJump).toBe(true);

    jumps.mockClear();
    act(() => {
      result.current.jumpToBottom();
    });
    expect(jumps).toHaveBeenCalledTimes(1);
    expect(result.current.showJump).toBe(false);
  });

  it("syncJump снимает кнопку, когда пользователь сам доскроллил вниз", () => {
    const { scroller, setGeometry } = fakeScroller(AT_TOP);
    const messages = [assistant("ответ")];
    const { result, rerender } = mount(scroller, { chatId: "one", messages, partial: "текст" });
    setGeometry(AT_TOP);
    rerender({ chatId: "one", messages, partial: "текст!" });
    expect(result.current.showJump).toBe(true);

    setGeometry({ scrollTop: 800, scrollHeight: 1000, clientHeight: 200 });
    act(() => {
      result.current.syncJump();
    });
    expect(result.current.showJump).toBe(false);
  });
});
