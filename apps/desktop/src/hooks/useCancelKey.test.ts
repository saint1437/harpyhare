import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultCombo } from "@/lib/hotkeys";
import { cancellable, useCancelKey, type Cancellable } from "./useCancelKey";

const KEYDOWN = "keydown";
const CANCEL_RECORDING = "cancel_recording";
const ESCAPE_CODE = "Escape";

describe("cancellable", () => {
  // Запись важнее: она идёт прямо сейчас и её отмена — то, что человек имел в
  // виду, нажимая клавишу. Запрос можно отменить и следующим нажатием.
  it("запись отменяется раньше запроса", () => {
    expect(cancellable(true, true)).toBe("recording");
    expect(cancellable(true, false)).toBe("recording");
  });

  it("без записи отменяется идущий запрос", () => {
    expect(cancellable(false, true)).toBe("stream");
  });

  // Отменять нечего — обработчик не вешается вовсе, и Escape достаётся тому,
  // кому и должен: диалогу, суфлёру, полю ввода.
  it("когда нечего отменять, клавиша не перехватывается", () => {
    expect(cancellable(false, false)).toBeNull();
  });
});

function escape(init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent(KEYDOWN, {
    ...init,
    code: ESCAPE_CODE,
    bubbles: true,
    cancelable: true,
  });
  document.dispatchEvent(event);
  return event;
}

function countKeydownListeners(): () => number {
  const spy = vi.spyOn(document, "addEventListener");
  return () => spy.mock.calls.filter(([type]) => type === KEYDOWN).length;
}

function renderCancelKey(target: Cancellable) {
  const onCancelRecording = vi.fn();
  const onCancelStream = vi.fn();
  renderHook(() => {
    useCancelKey(defaultCombo(CANCEL_RECORDING), target, onCancelRecording, onCancelStream);
  });
  return { onCancelRecording, onCancelStream };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useCancelKey", () => {
  it("во время записи сочетание отменяет запись и гасит событие", () => {
    const { onCancelRecording, onCancelStream } = renderCancelKey("recording");
    expect(escape().defaultPrevented).toBe(true);
    expect(onCancelRecording).toHaveBeenCalledTimes(1);
    expect(onCancelStream).not.toHaveBeenCalled();
  });

  it("во время ответа то же сочетание останавливает поток", () => {
    const { onCancelRecording, onCancelStream } = renderCancelKey("stream");
    escape();
    expect(onCancelStream).toHaveBeenCalledTimes(1);
    expect(onCancelRecording).not.toHaveBeenCalled();
  });

  it("когда отменять нечего, слушатель не вешается вовсе", () => {
    const keydownListeners = countKeydownListeners();
    renderCancelKey(null);
    expect(keydownListeners()).toBe(0);
    escape();
  });

  // Escape, съеденный слоем Radix, закрыл поповер — он не про отмену.
  it("уже погашенное событие не отменяет ничего", () => {
    const { onCancelStream } = renderCancelKey("stream");
    const event = new KeyboardEvent(KEYDOWN, {
      code: ESCAPE_CODE,
      bubbles: true,
      cancelable: true,
    });
    event.preventDefault();
    document.dispatchEvent(event);
    expect(onCancelStream).not.toHaveBeenCalled();
  });

  it("автоповтор удержанной клавиши второй раз не срабатывает", () => {
    const { onCancelStream } = renderCancelKey("stream");
    escape();
    escape({ repeat: true });
    expect(onCancelStream).toHaveBeenCalledTimes(1);
  });

  /**
   * App пересоздаёт эти колбэки инлайн на каждом рендере, а во время ответа
   * рендер идёт каждый кадр: подписка не должна сниматься и вешаться заново
   * ровно тогда, когда человек жмёт Escape.
   */
  it("новая идентичность колбэков не пересоздаёт подписку", () => {
    const keydownListeners = countKeydownListeners();
    const stale = vi.fn();
    const fresh = vi.fn();
    const { rerender } = renderHook(
      ({ onCancelStream }: { onCancelStream: () => void }) => {
        useCancelKey(defaultCombo(CANCEL_RECORDING), "stream", vi.fn(), onCancelStream);
      },
      { initialProps: { onCancelStream: stale } },
    );
    rerender({ onCancelStream: fresh });
    escape();
    expect(keydownListeners()).toBe(1);
    expect(stale).not.toHaveBeenCalled();
    expect(fresh).toHaveBeenCalledTimes(1);
  });
});
