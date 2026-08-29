import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { demoRu } from "@/i18n/demo-ru";
import type { DemoCopy, VoicePrompt } from "@/i18n/demo-types";
import type { DemoChat, DemoMessage } from "./types";
import { useDemoRun } from "./useDemoRun";

// The timings are private constants inside the hook; mirrored here because these
// tests are about the transitions between them, not about the numbers themselves.
const RECORDING_MS = 1500;
const TRANSCRIBING_MS = 750;
const AUTOSEND_DELAY_MS = 450;
const THINKING_MS = 900;
// The reveal's FLOOR, not its rate: the hook chases a simulated arrival and can
// go much faster, so this is only ever used as a safe upper bound on the wait.
const REVEAL_FLOOR_CHARS_PER_SECOND = 100;
const CHAT_LIMIT = 6;
const AUTO_TURN_INTERVAL_MS = 2800;
const AUTO_SUBMIT_DEBOUNCE_MS = 900;

const ANSWER = "Ответ, который заведомо длиннее одного кадра проявления.";
const FALLBACK = "Запасной ответ.";
const SEEDED: DemoMessage = { role: "user", text: "было" };

/**
 * The real dictionary with only the parts the state machine reads swapped for
 * short deterministic ones: `DemoCopy` is hundreds of lines of markup copy, and
 * writing it out by hand would test the fixture rather than the hook.
 */
const copy: DemoCopy = {
  ...demoRu,
  newChatTitle: "Новый чат",
  fallbackAnswer: FALLBACK,
  chats: [
    { id: "c1", title: "Первый", messages: [SEEDED] },
    { id: "c2", title: "Второй", messages: [] },
  ],
  prompts: [{ chip: "чип", question: "вопрос голосом", answer: ANSWER }],
};

function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`в состоянии нет: ${what}`);
  return value;
}

const prompt = (): VoicePrompt => must(copy.prompts[0], "prompt");

// A generous upper bound on the reveal, so the assertions never race the clock.
const revealMs = (text: string) =>
  Math.ceil((text.length / REVEAL_FLOOR_CHARS_PER_SECOND) * 1000) + 400;

function setup() {
  return renderHook(() => useDemoRun(copy));
}

function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function chatById(chats: DemoChat[], id: string): DemoChat {
  return must(
    chats.find((chat) => chat.id === id),
    `чат ${id}`,
  );
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      "setTimeout",
      "clearTimeout",
      "setInterval",
      "clearInterval",
      "Date",
      "performance",
      "requestAnimationFrame",
      "cancelAnimationFrame",
    ],
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useDemoRun — начальное состояние", () => {
  it("открывается на первом чате, с его сообщениями и пустым черновиком", () => {
    const { result } = setup();
    expect(result.current.activeId).toBe("c1");
    expect(result.current.active.title).toBe("Первый");
    expect(result.current.active.messages).toEqual([SEEDED]);
    expect(result.current.active.draft).toBe("");
    expect(result.current.phase).toBe("idle");
    expect(result.current.partial).toBeNull();
  });

  it("не делится массивом сообщений со словарём", () => {
    const { result } = setup();
    act(() => {
      result.current.setDraft("новое");
    });
    act(() => {
      result.current.send();
    });
    expect(must(copy.chats[0], "исходный чат").messages).toHaveLength(1);
  });

  it("берёт значения настроек из словаря", () => {
    const { result } = setup();
    // `buffer_enabled` приходит из вкладки «Речь» и включён по умолчанию,
    // поэтому окно стартует в состоянии «Наготове», а не «Не слушает».
    expect(result.current.settings["buffer_enabled"]).toBe(true);
    expect(result.current.listening).toBe("armed");
  });
});

describe("useDemoRun — отправка", () => {
  it("пустой черновик не запускает ничего", () => {
    const { result } = setup();
    act(() => {
      result.current.send();
    });
    expect(result.current.phase).toBe("idle");
    expect(result.current.active.messages).toHaveLength(1);
  });

  it("черновик из одних пробелов не запускает ничего", () => {
    const { result } = setup();
    act(() => {
      result.current.setDraft("   ");
    });
    act(() => {
      result.current.send();
    });
    expect(result.current.phase).toBe("idle");
  });

  it("обрезает текст, дописывает сообщение и чистит черновик", () => {
    const { result } = setup();
    act(() => {
      result.current.setDraft("  вопрос  ");
    });
    act(() => {
      result.current.send();
    });
    expect(result.current.active.messages.at(-1)).toEqual({ role: "user", text: "вопрос" });
    expect(result.current.active.draft).toBe("");
    expect(result.current.phase).toBe("streaming");
    expect(result.current.partial).toBe("");
  });

  it("до конца «думает» в чате ничего не появляется", () => {
    const { result } = setup();
    act(() => {
      result.current.setDraft("вопрос");
    });
    act(() => {
      result.current.send();
    });
    advance(THINKING_MS - 50);
    expect(result.current.partial).toBe("");
  });

  it("на незнакомый вопрос отвечает запасным текстом", () => {
    const { result } = setup();
    act(() => {
      result.current.setDraft("что-то своё");
    });
    act(() => {
      result.current.send();
    });
    advance(THINKING_MS + revealMs(FALLBACK));
    expect(result.current.active.messages.at(-1)).toEqual({ role: "assistant", text: FALLBACK });
    expect(result.current.phase).toBe("idle");
  });

  it("на известный вопрос отвечает своим текстом", () => {
    const { result } = setup();
    act(() => {
      result.current.setDraft(prompt().question);
    });
    act(() => {
      result.current.send();
    });
    advance(THINKING_MS + revealMs(ANSWER));
    expect(result.current.active.messages.at(-1)).toEqual({ role: "assistant", text: ANSWER });
  });

  it("ответ проявляется постепенно, а не целиком", () => {
    const { result } = setup();
    act(() => {
      result.current.setDraft(prompt().question);
    });
    act(() => {
      result.current.send();
    });
    advance(THINKING_MS + 60);
    const partial = must(result.current.partial, "partial");
    expect(partial.length).toBeGreaterThan(0);
    expect(partial.length).toBeLessThan(ANSWER.length);
    expect(ANSWER.startsWith(partial)).toBe(true);
  });
});

describe("useDemoRun — быстрые действия", () => {
  it("отправляют свой промпт и не трогают черновик", () => {
    const { result } = setup();
    act(() => {
      result.current.setDraft("недописанное");
    });
    act(() => {
      result.current.runQuickAction("Ответь короче.");
    });
    expect(result.current.active.messages.at(-1)).toEqual({
      role: "user",
      text: "Ответь короче.",
    });
    expect(result.current.active.draft).toBe("недописанное");
  });

  it("не срабатывают, пока окно свёрнуто в клубок", () => {
    const { result } = setup();
    act(() => {
      result.current.setCollapsed(true);
    });
    act(() => {
      result.current.runQuickAction("Ответь короче.");
    });
    expect(result.current.active.messages).toHaveLength(1);
  });
});

describe("useDemoRun — голосовой сценарий", () => {
  it("проходит запись → расшифровку → черновик → ответ", () => {
    const { result } = setup();
    act(() => {
      result.current.askByVoice(prompt());
    });
    expect(result.current.phase).toBe("recording");
    expect(result.current.listening).toBe("recording");

    advance(RECORDING_MS);
    expect(result.current.phase).toBe("transcribing");
    expect(result.current.listening).toBe("transcribing");

    advance(TRANSCRIBING_MS);
    expect(result.current.phase).toBe("idle");
    expect(result.current.active.draft).toBe(prompt().question);

    advance(AUTOSEND_DELAY_MS);
    expect(result.current.phase).toBe("streaming");
    expect(result.current.active.messages.at(-1)).toEqual({
      role: "user",
      text: prompt().question,
    });

    advance(THINKING_MS + revealMs(ANSWER));
    expect(result.current.active.messages.at(-1)).toEqual({ role: "assistant", text: ANSWER });
  });

  it("второй запуск отменяет первый", () => {
    const { result } = setup();
    act(() => {
      result.current.askByVoice(prompt());
    });
    advance(RECORDING_MS);
    act(() => {
      result.current.askByVoice(prompt());
    });
    advance(RECORDING_MS + TRANSCRIBING_MS + AUTOSEND_DELAY_MS + THINKING_MS + revealMs(ANSWER));
    expect(result.current.active.messages).toHaveLength(3);
  });
});

describe("useDemoRun — клавиша записи", () => {
  it("слишком короткое нажатие ничего не расшифровывает", () => {
    const { result } = setup();
    act(() => {
      result.current.startRecording();
    });
    advance(200);
    act(() => {
      result.current.stopRecording();
    });
    expect(result.current.phase).toBe("idle");
    expect(result.current.active.draft).toBe("");
  });

  it("удержание дольше порога кладёт расшифровку в поле ввода", () => {
    const { result } = setup();
    act(() => {
      result.current.startRecording();
    });
    advance(800);
    act(() => {
      result.current.stopRecording();
    });
    expect(result.current.phase).toBe("transcribing");
    advance(TRANSCRIBING_MS);
    expect(result.current.active.draft).toBe(prompt().question);
    expect(result.current.phase).toBe("idle");
  });

  it("с автоотправкой расшифровка сама уходит в чат", () => {
    const { result } = setup();
    act(() => {
      result.current.setSetting("auto_send", true);
    });
    act(() => {
      result.current.startRecording();
    });
    advance(800);
    act(() => {
      result.current.stopRecording();
    });
    advance(TRANSCRIBING_MS + AUTOSEND_DELAY_MS);
    expect(result.current.active.messages.at(-1)).toEqual({
      role: "user",
      text: prompt().question,
    });
  });
});

describe("useDemoRun — остановка", () => {
  it("сохраняет то, что успело проявиться", () => {
    const { result } = setup();
    act(() => {
      result.current.setDraft(prompt().question);
    });
    act(() => {
      result.current.send();
    });
    advance(THINKING_MS + 60);
    act(() => {
      result.current.stopStream();
    });
    const last = must(result.current.active.messages.at(-1), "последнее сообщение");
    expect(last.role).toBe("assistant");
    expect(last.text.length).toBeLessThan(ANSWER.length);
    expect(ANSWER.startsWith(last.text)).toBe(true);
  });

  it("остановка на «думает» не оставляет пустого ответа", () => {
    const { result } = setup();
    act(() => {
      result.current.setDraft("вопрос");
    });
    act(() => {
      result.current.send();
    });
    act(() => {
      result.current.stopStream();
    });
    expect(result.current.active.messages.at(-1)).toEqual({ role: "user", text: "вопрос" });
    expect(result.current.phase).toBe("idle");
  });

  it("остановленный ответ не возобновляется", () => {
    const { result } = setup();
    act(() => {
      result.current.setDraft("вопрос");
    });
    act(() => {
      result.current.send();
    });
    advance(THINKING_MS + 60);
    act(() => {
      result.current.stopStream();
    });
    const count = result.current.active.messages.length;
    advance(revealMs(FALLBACK));
    expect(result.current.active.messages).toHaveLength(count);
  });

  it("Escape отменяет запись, а потом ответ", () => {
    const { result } = setup();
    act(() => {
      result.current.startRecording();
    });
    act(() => {
      result.current.cancel();
    });
    expect(result.current.phase).toBe("idle");

    act(() => {
      result.current.setDraft("вопрос");
    });
    act(() => {
      result.current.send();
    });
    advance(THINKING_MS + 60);
    act(() => {
      result.current.cancel();
    });
    expect(result.current.phase).toBe("idle");
  });
});

describe("useDemoRun — вкладки", () => {
  it("новый чат добавляется и становится активным", () => {
    const { result } = setup();
    act(() => {
      result.current.newChat();
    });
    expect(result.current.chats).toHaveLength(3);
    expect(result.current.active.title).toBe("Новый чат");
  });

  it("дубликат создаёт пустой чат, не копируя историю", () => {
    const { result } = setup();
    act(() => {
      result.current.duplicateChat();
    });
    expect(result.current.chats).toHaveLength(3);
    expect(result.current.active.messages).toEqual([]);
  });

  it("больше предела чатов не создаётся", () => {
    const { result } = setup();
    for (let i = copy.chats.length; i < CHAT_LIMIT + 2; i += 1) {
      act(() => {
        result.current.newChat();
      });
    }
    expect(result.current.chats).toHaveLength(CHAT_LIMIT);
  });

  it("последний чат закрыть нельзя", () => {
    const { result } = setup();
    act(() => {
      result.current.closeChat("c2");
    });
    act(() => {
      result.current.closeChat("c1");
    });
    expect(result.current.chats).toHaveLength(1);
  });

  it("закрытие активного чата переводит фокус на оставшийся", () => {
    const { result } = setup();
    act(() => {
      result.current.closeChat("c1");
    });
    expect(result.current.activeId).toBe("c2");
  });

  it("переключение чата не обрывает ответ — он дописывается в фоне", () => {
    const { result } = setup();
    act(() => {
      result.current.setDraft("вопрос");
    });
    act(() => {
      result.current.send();
    });
    act(() => {
      result.current.selectChat("c2");
    });
    expect(result.current.streamingIds).toEqual(["c1"]);
    // Активный чат при этом не считается занятым — кнопка отправки в нём живая.
    expect(result.current.phase).toBe("idle");

    advance(THINKING_MS + revealMs(FALLBACK));
    expect(chatById(result.current.chats, "c1").messages).toHaveLength(3);
    expect(chatById(result.current.chats, "c2").messages).toHaveLength(0);
  });

  it("два чата могут отвечать одновременно", () => {
    const { result } = setup();
    act(() => {
      result.current.setDraft("первый вопрос");
    });
    act(() => {
      result.current.send();
    });
    act(() => {
      result.current.selectChat("c2");
    });
    act(() => {
      result.current.setDraft("второй вопрос");
    });
    act(() => {
      result.current.send();
    });
    expect(result.current.streamingIds).toHaveLength(2);
    advance(THINKING_MS + revealMs(FALLBACK));
    expect(chatById(result.current.chats, "c1").messages).toHaveLength(3);
    expect(chatById(result.current.chats, "c2").messages).toHaveLength(2);
  });

  it("повторная отправка в занятый чат ничего не добавляет", () => {
    const { result } = setup();
    act(() => {
      result.current.setDraft("вопрос");
    });
    act(() => {
      result.current.send();
    });
    act(() => {
      result.current.setDraft("ещё раз");
    });
    act(() => {
      result.current.send();
    });
    expect(result.current.active.messages).toHaveLength(2);
  });

  it("черновики у чатов свои", () => {
    const { result } = setup();
    act(() => {
      result.current.setDraft("первый");
    });
    act(() => {
      result.current.selectChat("c2");
    });
    act(() => {
      result.current.setDraft("второй");
    });
    expect(chatById(result.current.chats, "c1").draft).toBe("первый");
    expect(chatById(result.current.chats, "c2").draft).toBe("второй");
  });
});

describe("useDemoRun — правка истории", () => {
  it("удаляет сообщение по индексу", () => {
    const { result } = setup();
    act(() => {
      result.current.removeMessage(0);
    });
    expect(result.current.active.messages).toHaveLength(0);
  });

  it("переотправка отбрасывает всё, что было ниже", () => {
    const { result } = setup();
    act(() => {
      result.current.setDraft(prompt().question);
    });
    act(() => {
      result.current.send();
    });
    advance(THINKING_MS + revealMs(ANSWER));
    expect(result.current.active.messages).toHaveLength(3);

    act(() => {
      result.current.resendMessage(1);
    });
    expect(result.current.active.messages).toHaveLength(2);
    expect(result.current.phase).toBe("streaming");
  });

  it("очистка обрывает ответ и опустошает только активный чат", () => {
    const { result } = setup();
    act(() => {
      result.current.setDraft("вопрос");
    });
    act(() => {
      result.current.send();
    });
    act(() => {
      result.current.clearHistory();
    });
    advance(THINKING_MS + revealMs(FALLBACK));
    expect(chatById(result.current.chats, "c1").messages).toHaveLength(0);
    expect(result.current.phase).toBe("idle");
  });
});

describe("useDemoRun — состояние захвата", () => {
  it("пауза выключает буфер и переводит индикатор в «не слушает»", () => {
    const { result } = setup();
    act(() => {
      result.current.toggleBuffering();
    });
    expect(result.current.buffering).toBe(false);
    expect(result.current.listening).toBe("off");
  });

  it("автослушание перекрывает буфер, а пауза выключает и его", () => {
    const { result } = setup();
    act(() => {
      result.current.toggleAutoMode();
    });
    expect(result.current.listening).toBe("auto");
    act(() => {
      result.current.toggleBuffering();
    });
    expect(result.current.autoMode).toBe(false);
    expect(result.current.listening).toBe("off");
  });

  it("уведомление об ошибке переводит индикатор в «ошибка»", () => {
    const { result } = setup();
    act(() => {
      result.current.raiseNotification("contextTooLong");
    });
    expect(result.current.listening).toBe("error");
    act(() => {
      result.current.dismissNotification("contextTooLong");
    });
    expect(result.current.listening).toBe("armed");
  });

  it("запись перекрывает и ошибку, и автослушание", () => {
    const { result } = setup();
    act(() => {
      result.current.toggleAutoMode();
      result.current.raiseNotification("network");
    });
    act(() => {
      result.current.startRecording();
    });
    expect(result.current.listening).toBe("recording");
  });
});

describe("useDemoRun — уведомления", () => {
  it("повтор того же уведомления схлопывается в одну карточку со счётчиком", () => {
    const { result } = setup();
    act(() => {
      result.current.raiseNotification("network");
    });
    act(() => {
      result.current.raiseNotification("network");
    });
    expect(result.current.notifications).toHaveLength(1);
    expect(must(result.current.notifications[0], "уведомление").count).toBe(2);
  });

  it("отправка вычищает стопку — новая попытка это новый разговор", () => {
    const { result } = setup();
    act(() => {
      result.current.raiseNotification("network");
    });
    act(() => {
      result.current.setDraft("вопрос");
    });
    act(() => {
      result.current.send();
    });
    expect(result.current.notifications).toHaveLength(0);
  });

  it("уведомление уходит само по истечении своего времени", () => {
    const { result } = setup();
    act(() => {
      result.current.raiseNotification("network");
    });
    advance(30000);
    expect(result.current.notifications).toHaveLength(0);
  });
});

describe("useDemoRun — повтор распознавания", () => {
  it("сетевая ошибка оставляет кнопку повтора, которая переживает уведомление", () => {
    const { result } = setup();
    act(() => {
      result.current.raiseNotification("network");
    });
    expect(result.current.showRetry).toBe(true);
    advance(30000);
    expect(result.current.notifications).toHaveLength(0);
    expect(result.current.showRetry).toBe(true);
  });

  it("повтор возвращает последнюю расшифровку в поле ввода", () => {
    const { result } = setup();
    act(() => {
      result.current.startRecording();
    });
    advance(800);
    act(() => {
      result.current.stopRecording();
    });
    advance(TRANSCRIBING_MS);
    act(() => {
      result.current.setDraft("");
    });
    act(() => {
      result.current.retryTranscription();
    });
    advance(TRANSCRIBING_MS);
    expect(result.current.active.draft).toBe(prompt().question);
  });
});

describe("useDemoRun — свёрнутый режим", () => {
  it("сворачивается и разворачивается сочетанием клавиш", () => {
    const { result } = setup();
    act(() => {
      result.current.toggleCollapsed();
    });
    expect(result.current.collapsed).toBe(true);
    act(() => {
      result.current.toggleCollapsed();
    });
    expect(result.current.collapsed).toBe(false);
  });

  it("клубок показывает состояние захвата", () => {
    const { result } = setup();
    act(() => {
      result.current.setCollapsed(true);
    });
    expect(result.current.orb).toBe("armed");
    act(() => {
      result.current.startRecording();
    });
    expect(result.current.orb).toBe("recording");
  });

  it("расшифровка разворачивает окно, когда автоотправка выключена", () => {
    const { result } = setup();
    act(() => {
      result.current.startRecording();
    });
    advance(800);
    act(() => {
      result.current.stopRecording();
    });
    act(() => {
      result.current.setCollapsed(true);
    });
    advance(TRANSCRIBING_MS);
    expect(result.current.collapsed).toBe(false);
  });

  it("готовый ответ в активном чате разворачивает окно", () => {
    const { result } = setup();
    act(() => {
      result.current.setDraft("вопрос");
    });
    act(() => {
      result.current.send();
    });
    act(() => {
      result.current.setCollapsed(true);
    });
    advance(THINKING_MS + revealMs(FALLBACK));
    expect(result.current.collapsed).toBe(false);
    expect(result.current.unreadAnswer).toBe(false);
  });

  it("ответ в фоновом чате только помечает клубок, не разворачивая его", () => {
    const { result } = setup();
    act(() => {
      result.current.setDraft("вопрос");
    });
    act(() => {
      result.current.send();
    });
    // Уходим в другой чат — ответ продолжает писаться в c1 — и сворачиваемся.
    act(() => {
      result.current.selectChat("c2");
    });
    act(() => {
      result.current.setCollapsed(true);
    });
    advance(THINKING_MS + revealMs(FALLBACK));
    expect(result.current.collapsed).toBe(true);
    expect(result.current.unreadAnswer).toBe(true);
    expect(result.current.orb).toBe("answer");
  });

  it("разворот снимает пометку о непрочитанном ответе", () => {
    const { result } = setup();
    act(() => {
      result.current.setDraft("вопрос");
    });
    act(() => {
      result.current.send();
    });
    act(() => {
      result.current.selectChat("c2");
    });
    act(() => {
      result.current.setCollapsed(true);
    });
    advance(THINKING_MS + revealMs(FALLBACK));
    act(() => {
      result.current.toggleCollapsed();
    });
    expect(result.current.unreadAnswer).toBe(false);
  });
});

describe("useDemoRun — автослушание", () => {
  it("копит реплики, пока включено", () => {
    const { result } = setup();
    act(() => {
      result.current.toggleAutoMode();
    });
    advance(AUTO_TURN_INTERVAL_MS * 2);
    expect(result.current.turns.length).toBeGreaterThanOrEqual(2);
  });

  it("кнопка «Ответить» отправляет накопленное и помечает реплики отправленными", () => {
    const { result } = setup();
    act(() => {
      result.current.toggleAutoMode();
    });
    advance(AUTO_TURN_INTERVAL_MS);
    act(() => {
      result.current.answerPendingTurns();
    });
    expect(result.current.active.messages.at(-1)?.role).toBe("user");
    expect(result.current.turns.every((turn) => turn.sent)).toBe(true);
  });

  it("в режиме «без нажатия» реплика собеседника уходит сама", () => {
    const { result } = setup();
    act(() => {
      result.current.setSetting("auto_reply_instant", true);
    });
    act(() => {
      result.current.toggleAutoMode();
    });
    advance(AUTO_TURN_INTERVAL_MS + AUTO_SUBMIT_DEBOUNCE_MS + 50);
    expect(result.current.active.messages.length).toBeGreaterThan(1);
  });

  it("выключение стирает расшифровку", () => {
    const { result } = setup();
    act(() => {
      result.current.toggleAutoMode();
    });
    advance(AUTO_TURN_INTERVAL_MS);
    act(() => {
      result.current.toggleAutoMode();
    });
    expect(result.current.turns).toHaveLength(0);
  });
});

describe("useDemoRun — размонтирование", () => {
  it("после размонтирования таймеры ничего не ломают", () => {
    const { result, unmount } = setup();
    act(() => {
      result.current.askByVoice(prompt());
    });
    unmount();
    expect(() => {
      advance(RECORDING_MS + TRANSCRIBING_MS + AUTOSEND_DELAY_MS + THINKING_MS);
    }).not.toThrow();
  });
});
