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
const REVEAL_CHARS_PER_SECOND = 95;
const CHAT_LIMIT = 6;

const ANSWER = "Ответ, который заведомо длиннее одного кадра проявления.";
const FALLBACK = "Запасной ответ.";
const SEEDED: DemoMessage = { role: "user", text: "было" };

/**
 * The real dictionary with only the parts the state machine reads swapped for
 * short deterministic ones: `DemoCopy` is 180 lines of markup copy, and writing it
 * out by hand would test the fixture rather than the hook.
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
const revealMs = (text: string) => Math.ceil((text.length / REVEAL_CHARS_PER_SECOND) * 1000) + 200;

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
});

describe("useDemoRun — отправка", () => {
  it("пустой черновик не запускает ничего", () => {
    const { result } = setup();
    act(() => {
      result.current.send();
    });
    expect(result.current.phase).toBe("idle");
    expect(result.current.active.messages).toEqual([SEEDED]);
  });

  it("черновик из одних пробелов тоже не запускает ничего", () => {
    const { result } = setup();
    act(() => {
      result.current.setDraft("   ");
    });
    act(() => {
      result.current.send();
    });
    expect(result.current.phase).toBe("idle");
    expect(result.current.active.messages).toEqual([SEEDED]);
  });

  it("отправка добавляет вопрос, чистит черновик и уходит в streaming", () => {
    const { result } = setup();
    act(() => {
      result.current.setDraft("  как дела?  ");
    });
    act(() => {
      result.current.send();
    });
    expect(result.current.active.messages.at(-1)).toEqual({ role: "user", text: "как дела?" });
    expect(result.current.active.draft).toBe("");
    expect(result.current.phase).toBe("streaming");
    expect(result.current.partial).toBe("");
  });

  it("незнакомый вопрос получает запасной ответ", () => {
    const { result } = setup();
    act(() => {
      result.current.setDraft("такого в словаре нет");
    });
    act(() => {
      result.current.send();
    });
    advance(THINKING_MS + revealMs(FALLBACK));
    expect(result.current.active.messages.at(-1)).toEqual({ role: "assistant", text: FALLBACK });
    expect(result.current.phase).toBe("idle");
    expect(result.current.partial).toBeNull();
  });

  it("знакомый вопрос получает свой ответ", () => {
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

  it("до конца «раздумий» текст не появляется", () => {
    const { result } = setup();
    act(() => {
      result.current.setDraft(prompt().question);
    });
    act(() => {
      result.current.send();
    });
    advance(THINKING_MS - 1);
    expect(result.current.partial).toBe("");
    expect(result.current.phase).toBe("streaming");
  });

  it("ответ проявляется по частям, а не целиком", () => {
    const { result } = setup();
    act(() => {
      result.current.setDraft(prompt().question);
    });
    act(() => {
      result.current.send();
    });
    advance(THINKING_MS + 100);
    const partial = must(result.current.partial, "partial");
    expect(partial.length).toBeGreaterThan(0);
    expect(partial.length).toBeLessThan(ANSWER.length);
    expect(ANSWER.startsWith(partial)).toBe(true);
  });
});

describe("useDemoRun — голосовой сценарий", () => {
  it("проходит recording → transcribing → idle → streaming", () => {
    const { result } = setup();
    const voice = prompt();

    act(() => {
      result.current.askByVoice(voice);
    });
    expect(result.current.phase).toBe("recording");
    expect(result.current.active.draft).toBe("");

    advance(RECORDING_MS);
    expect(result.current.phase).toBe("transcribing");

    advance(TRANSCRIBING_MS);
    // Расшифровка кладётся в черновик и видна до автоотправки.
    expect(result.current.phase).toBe("idle");
    expect(result.current.active.draft).toBe(voice.question);

    advance(AUTOSEND_DELAY_MS);
    expect(result.current.phase).toBe("streaming");
    expect(result.current.active.messages.at(-1)).toEqual({ role: "user", text: voice.question });

    advance(THINKING_MS + revealMs(ANSWER));
    expect(result.current.active.messages.at(-1)).toEqual({ role: "assistant", text: ANSWER });
    expect(result.current.phase).toBe("idle");
  });

  it("повторный запуск отменяет предыдущий, а не накладывается на него", () => {
    const { result } = setup();
    act(() => {
      result.current.askByVoice(prompt());
    });
    advance(RECORDING_MS);
    expect(result.current.phase).toBe("transcribing");

    act(() => {
      result.current.askByVoice(prompt());
    });
    expect(result.current.phase).toBe("recording");

    advance(RECORDING_MS + TRANSCRIBING_MS + AUTOSEND_DELAY_MS + THINKING_MS + revealMs(ANSWER));
    // Ровно один вопрос и один ответ поверх исходного сообщения.
    expect(result.current.active.messages).toHaveLength(3);
  });
});

describe("useDemoRun — остановка", () => {
  it("оставляет в истории то, что успело проявиться", () => {
    const { result } = setup();
    act(() => {
      result.current.setDraft(prompt().question);
    });
    act(() => {
      result.current.send();
    });
    advance(THINKING_MS + 150);
    const shown = must(result.current.partial, "partial");
    expect(shown.length).toBeGreaterThan(0);

    act(() => {
      result.current.stopStream();
    });
    expect(result.current.phase).toBe("idle");
    expect(result.current.partial).toBeNull();
    const last = must(result.current.active.messages.at(-1), "последнее сообщение");
    expect(last.role).toBe("assistant");
    expect(last.text).toBe(shown);
    expect(last.text.length).toBeLessThan(ANSWER.length);
  });

  it("остановка во время «раздумий» не оставляет пустого ответа", () => {
    const { result } = setup();
    act(() => {
      result.current.setDraft(prompt().question);
    });
    act(() => {
      result.current.send();
    });
    advance(THINKING_MS - 1);
    act(() => {
      result.current.stopStream();
    });
    expect(result.current.active.messages).toEqual([
      SEEDED,
      { role: "user", text: prompt().question },
    ]);
    expect(result.current.phase).toBe("idle");
  });

  it("после остановки поток не оживает сам", () => {
    const { result } = setup();
    act(() => {
      result.current.setDraft(prompt().question);
    });
    act(() => {
      result.current.send();
    });
    advance(THINKING_MS + 150);
    act(() => {
      result.current.stopStream();
    });
    const after = result.current.active.messages.length;
    advance(revealMs(ANSWER));
    expect(result.current.active.messages).toHaveLength(after);
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
    expect(result.current.active.messages).toEqual([]);
    expect(result.current.activeId).toBe(must(result.current.chats.at(-1), "последний чат").id);
  });

  it("больше лимита вкладок не открывается", () => {
    const { result } = setup();
    for (let i = copy.chats.length; i < CHAT_LIMIT + 3; i++) {
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
    expect(result.current.chats).toHaveLength(1);
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
    expect(result.current.active.title).toBe("Второй");
  });

  it("закрытие неактивного чата фокус не двигает", () => {
    const { result } = setup();
    act(() => {
      result.current.closeChat("c2");
    });
    expect(result.current.activeId).toBe("c1");
  });

  it("переключение чата обрывает идущий ответ", () => {
    const { result } = setup();
    act(() => {
      result.current.setDraft(prompt().question);
    });
    act(() => {
      result.current.send();
    });
    expect(result.current.phase).toBe("streaming");

    act(() => {
      result.current.selectChat("c2");
    });
    expect(result.current.phase).toBe("idle");
    expect(result.current.partial).toBeNull();

    advance(THINKING_MS + revealMs(ANSWER));
    // Ответ не должен догнать ни новый чат, ни покинутый.
    expect(chatById(result.current.chats, "c2").messages).toEqual([]);
    expect(chatById(result.current.chats, "c1").messages).toHaveLength(2);
  });

  it("черновик у каждого чата свой", () => {
    const { result } = setup();
    act(() => {
      result.current.setDraft("для первого");
    });
    act(() => {
      result.current.selectChat("c2");
    });
    expect(result.current.active.draft).toBe("");
    act(() => {
      result.current.setDraft("для второго");
    });
    act(() => {
      result.current.selectChat("c1");
    });
    expect(result.current.active.draft).toBe("для первого");
  });
});

describe("useDemoRun — правка истории", () => {
  it("сообщение удаляется по индексу", () => {
    const { result } = setup();
    act(() => {
      result.current.setDraft("второе");
    });
    act(() => {
      result.current.send();
    });
    expect(result.current.active.messages).toHaveLength(2);
    act(() => {
      result.current.removeMessage(0);
    });
    expect(result.current.active.messages).toEqual([{ role: "user", text: "второе" }]);
  });

  it("очистка истории обрывает ответ и опустошает только активный чат", () => {
    const { result } = setup();
    act(() => {
      result.current.setDraft(prompt().question);
    });
    act(() => {
      result.current.send();
    });
    act(() => {
      result.current.clearHistory();
    });
    expect(result.current.active.messages).toEqual([]);
    expect(result.current.phase).toBe("idle");
    expect(result.current.partial).toBeNull();

    advance(THINKING_MS + revealMs(ANSWER));
    expect(result.current.active.messages).toEqual([]);
  });
});

describe("useDemoRun — размонтирование", () => {
  it("снимает таймеры, чтобы React не ругался на setState после unmount", () => {
    const { result, unmount } = setup();
    act(() => {
      result.current.setDraft(prompt().question);
    });
    act(() => {
      result.current.send();
    });
    unmount();
    expect(() => {
      vi.advanceTimersByTime(THINKING_MS + revealMs(ANSWER));
    }).not.toThrow();
  });
});
