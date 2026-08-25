import { describe, expect, it } from "vitest";
import { cancellable } from "./useCancelKey";

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
