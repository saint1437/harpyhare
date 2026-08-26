import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary, PanelErrorBoundary } from "./ErrorBoundary";

const { closeApp } = vi.hoisted(() => ({ closeApp: vi.fn() }));
vi.mock("@/ipc/commands", () => ({ closeApp }));

function Boom({ throws }: { throws: boolean }): React.ReactNode {
  if (throws) throw new Error("разметка сломалась");
  return <p>живой контент</p>;
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    // React logs the caught error itself; the boundary adds its own line.
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    closeApp.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("пропускает контент, пока ошибки нет", () => {
    render(
      <ErrorBoundary>
        <Boom throws={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("живой контент")).toBeTruthy();
  });

  // Это и есть смысл границы: без неё безрамочное прозрачное окно остаётся
  // пустым, и закрыть его нечем.
  it("показывает выход из положения вместо пустого окна", () => {
    render(
      <ErrorBoundary>
        <Boom throws={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Окно перестало отвечать")).toBeTruthy();
    expect(screen.getByText("разметка сломалась")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Перезагрузить окно" })).toBeTruthy();
  });

  it("даёт закрыть приложение, когда перезагрузка не помогает", () => {
    render(
      <ErrorBoundary>
        <Boom throws={true} />
      </ErrorBoundary>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Закрыть приложение" }));
    expect(closeApp).toHaveBeenCalledTimes(1);
  });

  it("сообщает о падении в консоль вместе с меткой границы", () => {
    render(
      <ErrorBoundary label="answer">
        <Boom throws={true} />
      </ErrorBoundary>,
    );
    const logged = vi.mocked(console.error).mock.calls.map((c) => String(c[0]));
    expect(logged.some((line) => line.includes("[answer] render failed"))).toBe(true);
  });
});

describe("PanelErrorBoundary", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // Падение одной панели не должно уносить композер, поэтому у неё свой
  // фолбэк с повтором, а не общий экран окна.
  it("показывает заголовок панели, а не экран всего окна", () => {
    render(
      <PanelErrorBoundary label="answer" title="Не удалось показать ответ">
        <Boom throws={true} />
      </PanelErrorBoundary>,
    );
    expect(screen.getByText("Не удалось показать ответ")).toBeTruthy();
    expect(screen.queryByText("Окно перестало отвечать")).toBeNull();
  });

  it("повтор возвращает панель, когда причина ушла", () => {
    function Flaky(): React.ReactNode {
      return (
        <PanelErrorBoundary label="answer" title="Не удалось показать ответ">
          <Boom throws={failing.value} />
        </PanelErrorBoundary>
      );
    }
    const failing = { value: true };
    const { rerender } = render(<Flaky />);
    expect(screen.getByText("Не удалось показать ответ")).toBeTruthy();

    // Порядок важен: reset рендерит те же элементы children, что и в прошлый
    // раз, поэтому причина должна уйти ДО нажатия, иначе панель упадёт снова.
    failing.value = false;
    rerender(<Flaky />);
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    expect(screen.getByText("живой контент")).toBeTruthy();
  });
});
