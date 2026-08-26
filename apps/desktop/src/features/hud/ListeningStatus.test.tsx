import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyLanguage, dictionary } from "@/i18n";
import type { RecorderState } from "@/ipc/types";
import { listeningState } from "@/lib/listening";
import { ListeningStatus } from "./ListeningStatus";

const ru = dictionary("ru");

afterEach(() => {
  cleanup();
  applyLanguage("ru");
});

describe("listeningState", () => {
  const base = {
    state: "idle" as RecorderState,
    autoListening: false,
    bufferEnabled: false,
    hasError: false,
  };

  // Главный пробел, который закрывает этап: буфер включён по умолчанию и
  // стартует вместе с окном, но простой с буфером выглядел ровно как простой
  // без него. Единственный переключатель жил в лаунчере, который для этого
  // надо уничтожить.
  it("простой с фоновым буфером отличается от простого без него", () => {
    expect(listeningState({ ...base, bufferEnabled: true })).toBe("armed");
    expect(listeningState({ ...base, bufferEnabled: false })).toBe("off");
  });

  it("запись и автослушание — оба «пишется», распознавание — нет", () => {
    expect(listeningState({ ...base, state: "recording" })).toBe("recording");
    expect(listeningState({ ...base, autoListening: true })).toBe("auto");
    expect(listeningState({ ...base, state: "transcribing" })).toBe("transcribing");
  });

  // Захват важнее ошибки: если звук прямо сейчас пишется, об этом надо сказать,
  // даже когда на экране висит сообщение о неудаче прошлого запроса.
  it("активный захват перекрывает ошибку", () => {
    expect(listeningState({ ...base, state: "recording", hasError: true })).toBe("recording");
    expect(listeningState({ ...base, hasError: true })).toBe("error");
  });

  it("у каждого состояния своё объявление для скринридера", () => {
    const all = ["recording", "transcribing", "auto", "armed", "off", "error"] as const;
    const said = all.map((state) => ru.common.listening[state].announcement);
    expect(new Set(said).size).toBe(all.length);
  });
});

describe("ListeningStatus", () => {
  it("несёт слово, а не только цвет и движение", () => {
    render(<ListeningStatus value="armed" paused={false} onTogglePause={vi.fn()} />);
    expect(screen.getByText(ru.common.listening.armed.word)).not.toBeNull();
  });

  it("слово состояния приходит из словаря выбранного языка", () => {
    applyLanguage("en");
    render(<ListeningStatus value="armed" paused={false} onTogglePause={vi.fn()} />);
    expect(screen.getByText(dictionary("en").common.listening.armed.word)).not.toBeNull();
  });

  it("пауза и возобновление — одна кнопка с разными подписями", () => {
    const onTogglePause = vi.fn();
    const { rerender } = render(
      <ListeningStatus value="armed" paused={false} onTogglePause={onTogglePause} />,
    );
    expect(screen.getByLabelText(ru.hud.listeningStatus.pauseLabel)).not.toBeNull();
    rerender(<ListeningStatus value="off" paused onTogglePause={onTogglePause} />);
    expect(screen.getByLabelText(ru.hud.listeningStatus.resumeLabel)).not.toBeNull();
  });
});
