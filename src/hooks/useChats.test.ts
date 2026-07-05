import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadChats = vi.fn<() => Promise<string>>();
const saveChats = vi.fn<(json: string) => Promise<void>>();
vi.mock("@/ipc/commands", () => ({
  loadChats: () => loadChats(),
  saveChats: (json: string) => saveChats(json),
}));

import { CHAT_LIMIT } from "@/lib/chats";
import { useChats } from "./useChats";

beforeEach(() => {
  vi.useFakeTimers();
  loadChats.mockResolvedValue("");
  saveChats.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("useChats", () => {
  it("стартует с одним пустым чатом, если на диске пусто", async () => {
    const { result } = renderHook(() => useChats());
    await waitFor(() => {
      expect(result.current.chats.length).toBe(1);
    });
    expect(result.current.active.messages).toEqual([]);
    expect(result.current.activeId).toBe(result.current.chats[0]?.id);
  });

  it("newChat добавляет чат, переключает на него и уважает лимит", async () => {
    const { result } = renderHook(() => useChats());
    await waitFor(() => {
      expect(result.current.chats.length).toBe(1);
    });
    for (let i = 1; i < CHAT_LIMIT; i++)
      act(() => {
        result.current.newChat();
      });
    expect(result.current.chats.length).toBe(CHAT_LIMIT);
    expect(result.current.activeId).toBe(result.current.chats[CHAT_LIMIT - 1]?.id);
    act(() => {
      result.current.newChat();
    }); // сверх лимита — игнор
    expect(result.current.chats.length).toBe(CHAT_LIMIT);
  });

  it("appendUserMessage ставит заголовок из первого вопроса и чистит черновик", async () => {
    const { result } = renderHook(() => useChats());
    await waitFor(() => {
      expect(result.current.chats.length).toBe(1);
    });
    const id = result.current.activeId;
    act(() => {
      result.current.setDraft(id, "длинный вопрос про рекурсию и стек", []);
    });
    act(() => {
      result.current.appendUserMessage(id, "длинный вопрос про рекурсию и стек", []);
    });
    expect(result.current.active.title).toBe("длинный вопрос про рек…");
    expect(result.current.active.draft).toBe("");
    expect(result.current.active.messages).toHaveLength(1);
    expect(result.current.active.messages[0]?.role).toBe("user");
  });

  it("appendAssistantMessage дописывает ответ", async () => {
    const { result } = renderHook(() => useChats());
    await waitFor(() => {
      expect(result.current.chats.length).toBe(1);
    });
    const id = result.current.activeId;
    act(() => {
      result.current.appendUserMessage(id, "вопрос", []);
    });
    act(() => {
      result.current.appendAssistantMessage(id, "ответ");
    });
    expect(result.current.active.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(result.current.active.messages[1]?.text).toBe("ответ");
  });

  it("renameChat меняет заголовок и закрепляет его (авто-заголовок не перезатирает)", async () => {
    const { result } = renderHook(() => useChats());
    await waitFor(() => {
      expect(result.current.chats.length).toBe(1);
    });
    const id = result.current.activeId;
    act(() => {
      result.current.renameChat(id, "Собес Acme");
    });
    expect(result.current.active.title).toBe("Собес Acme");
    // первое сообщение после ручного имени НЕ перезатирает заголовок
    act(() => {
      result.current.appendUserMessage(id, "расскажи о себе", []);
    });
    expect(result.current.active.title).toBe("Собес Acme");
  });

  it("renameChat игнорирует пустое имя", async () => {
    const { result } = renderHook(() => useChats());
    await waitFor(() => {
      expect(result.current.chats.length).toBe(1);
    });
    const id = result.current.activeId;
    const before = result.current.active.title;
    act(() => {
      result.current.renameChat(id, "   ");
    });
    expect(result.current.active.title).toBe(before);
  });

  it("новый чат ссылается на сид-пресет; setChatPreset меняет ссылку", async () => {
    const { result } = renderHook(() => useChats());
    await waitFor(() => {
      expect(result.current.chats.length).toBe(1);
    });
    expect(result.current.active.presetId).toBe("transcription");
    const id = result.current.activeId;
    act(() => {
      result.current.setChatPreset(id, "mypreset");
    });
    expect(result.current.active.presetId).toBe("mypreset");
  });

  it("новый чат — с дефолтной моделью; setChatModel меняет по чату", async () => {
    const { result } = renderHook(() => useChats());
    await waitFor(() => {
      expect(result.current.chats.length).toBe(1);
    });
    expect(result.current.active.model).toBe("claude-opus-4-8");
    const id = result.current.activeId;
    act(() => {
      result.current.setChatModel(id, "claude-haiku-4-5");
    });
    expect(result.current.active.model).toBe("claude-haiku-4-5");
  });

  it("новый чат — с thinking; setChatThinking выключает его по чату", async () => {
    const { result } = renderHook(() => useChats());
    await waitFor(() => {
      expect(result.current.chats.length).toBe(1);
    });
    expect(result.current.active.thinkingEnabled).toBe(true);
    const id = result.current.activeId;
    act(() => {
      result.current.setChatThinking(id, false);
    });
    expect(result.current.active.thinkingEnabled).toBe(false);
  });

  it("новый чат — без веб-поиска; setChatWebSearch включает по чату", async () => {
    const { result } = renderHook(() => useChats());
    await waitFor(() => {
      expect(result.current.chats.length).toBe(1);
    });
    expect(result.current.active.webSearch).toBe(false);
    const id = result.current.activeId;
    act(() => {
      result.current.setChatWebSearch(id, true);
    });
    expect(result.current.active.webSearch).toBe(true);
  });

  it("новый чат — без контекста; setChatContext задаёт его по чату", async () => {
    const { result } = renderHook(() => useChats());
    await waitFor(() => {
      expect(result.current.chats.length).toBe(1);
    });
    expect(result.current.active.context).toBe("");
    const id = result.current.activeId;
    act(() => {
      result.current.setChatContext(id, "резюме кандидата");
    });
    expect(result.current.active.context).toBe("резюме кандидата");
  });

  it("removeChat не даёт удалить последний и переключает активный", async () => {
    const { result } = renderHook(() => useChats());
    await waitFor(() => {
      expect(result.current.chats.length).toBe(1);
    });
    const first = result.current.activeId;
    act(() => {
      result.current.newChat();
    });
    const second = result.current.activeId;
    act(() => {
      result.current.removeChat(second);
    });
    expect(result.current.chats.length).toBe(1);
    expect(result.current.activeId).toBe(first);
    act(() => {
      result.current.removeChat(first);
    }); // последний — нельзя
    expect(result.current.chats.length).toBe(1);
  });

  it("дебаунсит сохранение на диск", async () => {
    const { result } = renderHook(() => useChats());
    await waitFor(() => {
      expect(result.current.chats.length).toBe(1);
    });
    saveChats.mockClear();
    act(() => {
      result.current.newChat();
    });
    expect(saveChats).not.toHaveBeenCalled(); // ещё не прошёл дебаунс
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(saveChats).toHaveBeenCalledTimes(1);
  });
});
