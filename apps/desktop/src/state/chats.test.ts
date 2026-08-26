import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CHAT_LIMIT, createChat, type Chat } from "@/lib/chats";
import type { Attachment } from "@/lib/composer";
import {
  adoptChats,
  appendAssistantMessage,
  appendQuickActionMessage,
  appendUserMessage,
  clearMessages,
  duplicateChat,
  getActiveChat,
  getActiveChatId,
  getChats,
  newChat,
  patchChat,
  removeChat,
  removeMessage,
  resetChatsState,
  selectChat,
  subscribeChats,
  useActiveChatId,
  useActiveChatWithoutDraft,
  useActiveDraft,
  useActiveMessages,
  useChatTabs,
} from "./chats";

const IMAGE_ID = "00000000000000aa.png";
const ATTACHMENT: Attachment = {
  id: IMAGE_ID,
  payload: { media_type: "image/png", data: "AAAA" },
  preview: "data:image/png;base64,AAAA",
};

function seed(chats: Chat[] = [createChat(1, "c1")]): void {
  adoptChats(chats, chats[0]?.id ?? "");
}

afterEach(() => {
  // Module scope outlives a case, and so does a hook left mounted by an earlier
  // one — both would carry state into the next test.
  cleanup();
  resetChatsState();
});

describe("state/chats", () => {
  it("newChat добавляет чат, переключает на него и уважает лимит", () => {
    seed();
    for (let i = 1; i < CHAT_LIMIT; i++) newChat();
    expect(getChats().length).toBe(CHAT_LIMIT);
    expect(getActiveChatId()).toBe(getChats()[CHAT_LIMIT - 1]?.id);
    newChat();
    expect(getChats().length).toBe(CHAT_LIMIT);
  });

  it("duplicateChat создаёт чистый чат с настройками исходного и уважает лимит", () => {
    seed();
    const sourceId = getActiveChatId();
    appendUserMessage(sourceId, "вопрос", []);
    patchChat(sourceId, {
      model: "claude-opus-4-8",
      thinkingEnabled: true,
      webSearch: true,
      presetId: "golang",
      context: "справка",
      libraryDocIds: ["doc-1"],
      draft: "недописанное",
    });
    duplicateChat(sourceId);
    expect(getChats().length).toBe(2);
    const copy = getActiveChat();
    expect(copy.id).not.toBe(sourceId);
    expect(copy.messages).toEqual([]);
    expect(copy.draft).toBe("");
    expect(copy.model).toBe("claude-opus-4-8");
    expect(copy.thinkingEnabled).toBe(true);
    expect(copy.webSearch).toBe(true);
    expect(copy.presetId).toBe("golang");
    expect(copy.context).toBe("справка");
    expect(copy.libraryDocIds).toEqual(["doc-1"]);
    while (getChats().length < CHAT_LIMIT) newChat();
    duplicateChat(getActiveChatId());
    expect(getChats().length).toBe(CHAT_LIMIT);
  });

  it("appendUserMessage ставит заголовок из первого вопроса и чистит черновик", () => {
    seed();
    const id = getActiveChatId();
    patchChat(id, { draft: "длинный вопрос про рекурсию и стек" });
    appendUserMessage(id, "длинный вопрос про рекурсию и стек", []);
    expect(getActiveChat().title).toBe("длинный вопрос про рек…");
    expect(getActiveChat().draft).toBe("");
    expect(getActiveChat().messages).toHaveLength(1);
    expect(getActiveChat().messages[0]?.role).toBe("user");
  });

  it("appendQuickActionMessage не трогает черновик и оставляет неотправленные вложения", () => {
    seed();
    const id = getActiveChatId();
    patchChat(id, { draft: "недописанный промпт", draftAttachments: [ATTACHMENT] });
    appendQuickActionMessage(id, "Переведи на английский", []);
    expect(getActiveChat().messages).toHaveLength(1);
    expect(getActiveChat().messages[0]?.text).toBe("Переведи на английский");
    expect(getActiveChat().draft).toBe("недописанный промпт");
    expect(getActiveChat().draftAttachments).toEqual([ATTACHMENT]);
  });

  it("appendQuickActionMessage чистит вложения, ушедшие в сообщение, но не черновик", () => {
    seed();
    const id = getActiveChatId();
    patchChat(id, { draft: "недописанный промпт", draftAttachments: [ATTACHMENT] });
    appendQuickActionMessage(id, "Опиши скриншот", [{ ...ATTACHMENT.payload, id: IMAGE_ID }]);
    expect(getActiveChat().messages[0]?.images).toEqual([{ ...ATTACHMENT.payload, id: IMAGE_ID }]);
    expect(getActiveChat().draftAttachments).toEqual([]);
    expect(getActiveChat().draft).toBe("недописанный промпт");
    expect(getActiveChat().title).toBe("Опиши скриншот");
  });

  it("removeMessage удаляет сообщение по индексу (и своё, и ответ)", () => {
    seed();
    const id = getActiveChatId();
    appendUserMessage(id, "вопрос", []);
    appendAssistantMessage(id, "ответ");
    removeMessage(id, 1);
    expect(getActiveChat().messages.map((m) => m.role)).toEqual(["user"]);
    removeMessage(id, 0);
    expect(getActiveChat().messages).toEqual([]);
  });

  it("clearMessages стирает историю и сбрасывает lastInputTokens, не трогая черновик", () => {
    seed();
    const id = getActiveChatId();
    appendUserMessage(id, "вопрос", []);
    appendAssistantMessage(id, "ответ");
    patchChat(id, { lastInputTokens: 1234 });
    patchChat(id, { draft: "недописанный промпт" });
    clearMessages(id);
    expect(getActiveChat().messages).toEqual([]);
    expect(getActiveChat().lastInputTokens).toBe(0);
    expect(getActiveChat().draft).toBe("недописанный промпт");
  });

  it("appendAssistantMessage дописывает ответ", () => {
    seed();
    const id = getActiveChatId();
    appendUserMessage(id, "вопрос", []);
    appendAssistantMessage(id, "ответ");
    expect(getActiveChat().messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(getActiveChat().messages[1]?.text).toBe("ответ");
  });

  it.each([
    { field: "presetId", initial: "", next: "mypreset" },
    { field: "model", initial: "claude-haiku-4-5-20251001", next: "claude-opus-4-8" },
    { field: "thinkingEnabled", initial: false, next: true },
    { field: "webSearch", initial: false, next: true },
    { field: "context", initial: "", next: "резюме кандидата" },
    { field: "libraryDocIds", initial: [], next: ["doc-1"] },
  ] as const)("patchChat меняет $field только в своём чате", ({ field, initial, next }) => {
    seed();
    expect(getActiveChat()[field]).toEqual(initial);
    const id = getActiveChatId();
    newChat();
    patchChat(id, { [field]: next });
    expect(getChats().find((c) => c.id === id)?.[field]).toEqual(next);
    expect(getActiveChat()[field]).toEqual(initial);
  });

  it("patchChat пишет несколько полей за один вызов", () => {
    seed();
    patchChat(getActiveChatId(), { context: "контекст", libraryDocIds: ["a", "b"] });
    expect(getActiveChat().context).toBe("контекст");
    expect(getActiveChat().libraryDocIds).toEqual(["a", "b"]);
  });

  it("removeChat не даёт удалить последний и переключает активный", () => {
    seed();
    const first = getActiveChatId();
    newChat();
    const second = getActiveChatId();
    removeChat(second);
    expect(getChats().length).toBe(1);
    expect(getActiveChatId()).toBe(first);
    removeChat(first);
    expect(getChats().length).toBe(1);
  });

  // Снимок, который каждый раз новый объект, крутит useSyncExternalStore вечно —
  // то же правило, что в state/stream.
  it("мутатор, который ничего не изменил, не рассылает событие", () => {
    seed();
    const listener = vi.fn();
    const stop = subscribeChats(listener);
    const id = getActiveChatId();
    patchChat(id, { draft: "" });
    patchChat("которого-нет", { draft: "x" });
    removeMessage(id, 7);
    clearMessages(id);
    selectChat(getActiveChatId());
    expect(listener).not.toHaveBeenCalled();
    stop();
  });
});

describe("state/chats — селекторы", () => {
  /** Renders one hook and counts how many times it ran. */
  function counted<T>(hook: () => T) {
    const renders = vi.fn();
    const { result } = renderHook(() => {
      renders();
      return hook();
    });
    return { renders, result };
  }

  // Главный выигрыш всей задачи: набор текста не трогает ни список сообщений,
  // ни вкладки, ни «чат без черновика», который читает корень HUD.
  it("нажатие клавиши в композере будит только подписчика черновика", () => {
    seed();
    const draft = counted(useActiveDraft);
    const messages = counted(useActiveMessages);
    const tabs = counted(useChatTabs);
    const withoutDraft = counted(useActiveChatWithoutDraft);
    const before = {
      draft: draft.renders.mock.calls.length,
      messages: messages.renders.mock.calls.length,
      tabs: tabs.renders.mock.calls.length,
      withoutDraft: withoutDraft.renders.mock.calls.length,
    };

    const id = getActiveChatId();
    for (const text of ["п", "пр", "при", "прив"]) {
      act(() => {
        patchChat(id, { draft: text });
      });
    }

    expect(draft.renders.mock.calls.length).toBeGreaterThan(before.draft + 3);
    expect(draft.result.current).toBe("прив");
    expect(messages.renders.mock.calls.length).toBe(before.messages);
    expect(tabs.renders.mock.calls.length).toBe(before.tabs);
    expect(withoutDraft.renders.mock.calls.length).toBe(before.withoutDraft);
  });

  it("список вкладок сохраняет ссылку, пока id и заголовки те же", () => {
    seed();
    const { result } = renderHook(() => useChatTabs());
    const before = result.current;
    act(() => {
      patchChat(getActiveChatId(), { draft: "текст", lastInputTokens: 42 });
    });
    expect(result.current).toBe(before);
  });

  it("вкладки обновляются, когда заголовок появился из первого вопроса", () => {
    seed();
    const { result } = renderHook(() => useChatTabs());
    act(() => {
      appendUserMessage(getActiveChatId(), "вопрос", []);
    });
    expect(result.current).toEqual([{ id: "c1", title: "вопрос" }]);
  });

  it("useActiveChatId переживает переключение чата, а useActiveMessages — нет", () => {
    seed([createChat(1, "one"), createChat(2, "two")]);
    const { result: id } = renderHook(() => useActiveChatId());
    const messages = counted(useActiveMessages);
    expect(id.current).toBe("one");
    const before = messages.renders.mock.calls.length;
    act(() => {
      selectChat("two");
    });
    expect(id.current).toBe("two");
    expect(messages.renders.mock.calls.length).toBeGreaterThan(before);
  });

  // Фантомный активный id — чат, которого нет, — раньше означал невыделенную
  // вкладку и композер, редактирующий chats[0] через запасной путь.
  it("активный id, которого нет в списке, съезжает на первый чат", () => {
    adoptChats([createChat(1, "one")], "которого-нет");
    expect(getActiveChatId()).toBe("one");
    expect(getActiveChat().id).toBe("one");
  });
});
