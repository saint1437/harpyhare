import { describe, expect, it } from "vitest";
import { chatTitle, createChat, deserializeChats, serializeChats, type Chat } from "./chats";

const img = { media_type: "image/png", data: "AAAA" };

function chatWith(messages: Chat["messages"], extra: Partial<Chat> = {}): Chat {
  return {
    id: "x",
    title: "Чат 1",
    messages,
    draft: "",
    draftAttachments: [],
    titlePinned: false,
    presetId: "transcription",
    thinkingEnabled: true,
    model: "claude-opus-4-8",
    ...extra,
  };
}

describe("createChat", () => {
  it("даёт уникальный id и заголовок по индексу", () => {
    const a = createChat(1);
    const b = createChat(2);
    expect(a.id).not.toBe(b.id);
    expect(a.title).toBe("Чат 1");
    expect(b.title).toBe("Чат 2");
    expect(a.messages).toEqual([]);
    expect(a.draft).toBe("");
  });
});

describe("chatTitle", () => {
  it("берёт начало первого пользовательского сообщения", () => {
    expect(chatTitle("объясни рекурсию подробно и с примерами", 1)).toBe("объясни рекурсию подро…");
  });
  it("короткий текст не обрезает", () => {
    expect(chatTitle("привет", 1)).toBe("привет");
  });
  it("пустой текст → запасной заголовок по индексу", () => {
    expect(chatTitle("   ", 3)).toBe("Чат 3");
  });
});

describe("serialize/deserialize", () => {
  it("стрипает картинки из сообщений и черновые вложения", () => {
    const chats = [
      chatWith(
        [
          { role: "user", text: "что тут?", images: [img] },
          { role: "assistant", text: "кот", images: [] },
        ],
        { draft: "недописанное", draftAttachments: [{ payload: img, preview: "data:..." }] },
      ),
    ];
    const json = serializeChats(chats);
    const parsed = JSON.parse(json) as {
      messages: { text: string; images: unknown[] }[];
      draft: string;
      draftAttachments: unknown[];
    }[];
    expect(parsed[0]?.messages[0]?.images).toEqual([]);
    expect(parsed[0]?.messages[0]?.text).toBe("что тут?");
    expect(parsed[0]?.draft).toBe("недописанное");
    expect(parsed[0]?.draftAttachments).toEqual([]);
  });

  it("round-trip восстанавливает чаты с пустыми вложениями", () => {
    const chats = [chatWith([{ role: "user", text: "вопрос", images: [] }], { draft: "хвост" })];
    const restored = deserializeChats(serializeChats(chats));
    expect(restored).not.toBeNull();
    expect(restored?.[0]?.messages[0]?.text).toBe("вопрос");
    expect(restored?.[0]?.draft).toBe("хвост");
    expect(restored?.[0]?.draftAttachments).toEqual([]);
  });

  it("пустая строка → null", () => {
    expect(deserializeChats("")).toBeNull();
  });

  it("битый JSON → null", () => {
    expect(deserializeChats("{не json")).toBeNull();
  });

  it("пустой массив → null (фронт создаст стартовый чат)", () => {
    expect(deserializeChats("[]")).toBeNull();
  });

  it("сохраняет titlePinned при round-trip", () => {
    const chats = [chatWith([], { title: "Моё имя", titlePinned: true })];
    const restored = deserializeChats(serializeChats(chats));
    expect(restored?.[0]?.title).toBe("Моё имя");
    expect(restored?.[0]?.titlePinned).toBe(true);
  });

  it("старый json без titlePinned → titlePinned=false", () => {
    const restored = deserializeChats('[{"id":"a","title":"Чат 1","messages":[],"draft":""}]');
    expect(restored?.[0]?.titlePinned).toBe(false);
  });

  it("сохраняет presetId при round-trip; старый json без него → ''", () => {
    const chats = [chatWith([], { presetId: "abc" })];
    expect(deserializeChats(serializeChats(chats))?.[0]?.presetId).toBe("abc");
    const old = deserializeChats('[{"id":"a","title":"Чат 1","messages":[],"draft":""}]');
    expect(old?.[0]?.presetId).toBe("");
  });

  it("сохраняет thinkingEnabled при round-trip; старый json без него → true", () => {
    const chats = [chatWith([], { thinkingEnabled: false })];
    expect(deserializeChats(serializeChats(chats))?.[0]?.thinkingEnabled).toBe(false);
    const old = deserializeChats('[{"id":"a","title":"Чат 1","messages":[],"draft":""}]');
    expect(old?.[0]?.thinkingEnabled).toBe(true);
  });

  it("сохраняет model при round-trip; старый json без него → дефолтная модель", () => {
    const chats = [chatWith([], { model: "claude-haiku-4-5" })];
    expect(deserializeChats(serializeChats(chats))?.[0]?.model).toBe("claude-haiku-4-5");
    const old = deserializeChats('[{"id":"a","title":"Чат 1","messages":[],"draft":""}]');
    expect(old?.[0]?.model).toBe("claude-opus-4-8");
  });
});
