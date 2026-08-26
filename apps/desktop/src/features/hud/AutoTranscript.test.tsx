import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyLanguage, dictionary } from "@/i18n";
import type { AutoTurn } from "@/ipc/types";
import { AutoTranscript } from "./AutoTranscript";

const ANSWER_COMBO = "Cmd+Shift+Enter";
const ru = dictionary("ru");
const copy = ru.hud.autoTranscript;

function turn(seq: number, speaker: AutoTurn["speaker"], text: string): AutoTurn {
  return { seq, speaker, text };
}

function renderPanel(overrides: Partial<Parameters<typeof AutoTranscript>[0]> = {}) {
  const props = {
    turns: [turn(0, "interviewer", "Что такое GC?")],
    submittedThrough: -1,
    pendingCount: 1,
    instant: false,
    answerCombo: ANSWER_COMBO,
    onAnswer: vi.fn(),
    ...overrides,
  };
  render(<AutoTranscript {...props} />);
  return props;
}

function answerButton(): HTMLButtonElement {
  const button = screen.getByText(copy.answer).closest("button");
  if (!button) throw new Error("кнопка ответа не найдена");
  return button;
}

afterEach(() => {
  cleanup();
  applyLanguage("ru");
  vi.clearAllMocks();
});

describe("AutoTranscript", () => {
  it("показывает реплики с метками говорящих", () => {
    renderPanel({
      turns: [turn(0, "interviewer", "Что такое GC?"), turn(1, "user", "Сборщик мусора.")],
      pendingCount: 2,
    });
    expect(screen.getByText(`${ru.common.speakers.interviewer}:`)).not.toBeNull();
    expect(screen.getByText(`${ru.common.speakers.user}:`)).not.toBeNull();
    expect(screen.getByText(/Сборщик мусора\./)).not.toBeNull();
  });

  it("ручной режим отправляет накопленное по кнопке и называет сочетание", () => {
    const { onAnswer } = renderPanel();
    expect(answerButton().title).toContain("⌘⇧⏎");
    fireEvent.click(answerButton());
    expect(onAnswer).toHaveBeenCalledTimes(1);
  });

  it("нечего отправлять — кнопка занята, и это сказано словами", () => {
    renderPanel({ pendingCount: 0, submittedThrough: 0 });
    expect(answerButton().disabled).toBe(true);
    expect(screen.getByText(copy.answered)).not.toBeNull();
  });

  it("в мгновенном режиме кнопки нет — отправка происходит сама", () => {
    renderPanel({ instant: true });
    expect(screen.queryByText(copy.answer)).toBeNull();
    expect(screen.getByText(copy.instant)).not.toBeNull();
  });

  it("пустая расшифровка честно говорит, что слушает", () => {
    renderPanel({ turns: [], pendingCount: 0 });
    expect(screen.getByText(copy.empty)).not.toBeNull();
  });

  // Метка на экране идёт из словаря, а не из `lib/auto-turns`: та осталась
  // русской, потому что её читает модель, а не человек.
  it("метки говорящих следуют языку интерфейса", () => {
    applyLanguage("en");
    renderPanel({ turns: [turn(0, "interviewer", "What is GC?")], pendingCount: 1 });
    expect(screen.getByText(`${dictionary("en").common.speakers.interviewer}:`)).not.toBeNull();
  });

  it("отправленные реплики приглушены, неотправленные — нет", () => {
    renderPanel({
      turns: [turn(0, "interviewer", "Первый?"), turn(1, "interviewer", "Второй?")],
      submittedThrough: 0,
      pendingCount: 1,
    });
    const sent = screen.getByText(/Первый\?/).closest("li");
    const fresh = screen.getByText(/Второй\?/).closest("li");
    expect(sent?.className).toContain("text-fg-subtle");
    expect(fresh?.className).toContain("text-fg");
  });
});
