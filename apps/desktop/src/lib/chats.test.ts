import { getDict } from "@/i18n";
import { describe, expect, it } from "vitest";
import {
  chatImageIds,
  chatTitle,
  createChat,
  createChatFrom,
  deserializeChats,
  hydrateChatImages,
  serializeChats,
  type Chat,
  type StoredChat,
} from "./chats";

const img = { id: "00000000000000aa.png", media_type: "image/png", data: "AAAA" };

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
    webSearch: false,
    context: "",
    libraryDocIds: [],
    lastInputTokens: 0,
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

  it("новые дефолты: без пресета, thinking выкл, модель haiku, веб-поиск выкл", () => {
    const c = createChat(1);
    expect(c.presetId).toBe("");
    expect(c.thinkingEnabled).toBe(false);
    expect(c.model).toBe("claude-haiku-4-5-20251001");
    expect(c.webSearch).toBe(false);
  });
});

describe("createChatFrom", () => {
  it("копирует параметры запроса и контекст, но не содержимое", () => {
    const source = chatWith([{ role: "user", text: "вопрос", images: [img] }], {
      title: "Мой чат",
      titlePinned: true,
      draft: "недописанное",
      draftAttachments: [{ id: img.id, payload: img, preview: "data:image/png;base64,AAAA" }],
      presetId: "golang",
      thinkingEnabled: true,
      model: "claude-opus-4-8",
      webSearch: true,
      context: "справка",
      libraryDocIds: ["a", "b"],
      lastInputTokens: 4242,
    });
    const copy = createChatFrom(source, 3);
    expect(copy.id).not.toBe(source.id);
    expect(copy.title).toBe("Чат 3");
    expect(copy.titlePinned).toBe(false);
    expect(copy.messages).toEqual([]);
    expect(copy.draft).toBe("");
    expect(copy.draftAttachments).toEqual([]);
    expect(copy.lastInputTokens).toBe(0);
    expect(copy.presetId).toBe("golang");
    expect(copy.thinkingEnabled).toBe(true);
    expect(copy.model).toBe("claude-opus-4-8");
    expect(copy.webSearch).toBe(true);
    expect(copy.context).toBe("справка");
    expect(copy.libraryDocIds).toEqual(["a", "b"]);
    expect(copy.libraryDocIds).not.toBe(source.libraryDocIds);
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
  it("пишет ссылку на картинку, а не её байты", () => {
    const chats = [
      chatWith(
        [
          { role: "user", text: "что тут?", images: [img] },
          { role: "assistant", text: "кот", images: [] },
        ],
        {
          draft: "недописанное",
          draftAttachments: [{ id: img.id, payload: img, preview: "data:..." }],
        },
      ),
    ];
    const json = serializeChats(chats);
    const parsed = JSON.parse(json) as {
      messages: { text: string; images: unknown[] }[];
      draft: string;
      draftAttachments: unknown[];
    }[];
    const ref = { id: img.id, media_type: img.media_type };
    expect(parsed[0]?.messages[0]?.images).toEqual([ref]);
    expect(parsed[0]?.messages[0]?.text).toBe("что тут?");
    expect(parsed[0]?.draft).toBe("недописанное");
    expect(parsed[0]?.draftAttachments).toEqual([ref]);
    expect(json).not.toContain(img.data);
  });

  it("не сохраняет картинку, которую не удалось записать на диск", () => {
    const chats = [chatWith([{ role: "user", text: "что тут?", images: [{ ...img, id: "" }] }])];
    const parsed = JSON.parse(serializeChats(chats)) as { messages: { images: unknown[] }[] }[];
    expect(parsed[0]?.messages[0]?.images).toEqual([]);
  });

  it("гидратация возвращает байты по ссылке и в сообщение, и в черновик", () => {
    const chats = [
      chatWith([{ role: "user", text: "что тут?", images: [img] }], {
        draftAttachments: [{ id: img.id, payload: img, preview: "data:..." }],
      }),
    ];
    const restored = deserializeChats(serializeChats(chats));
    expect(restored?.[0]?.messages[0]?.images[0]?.data).toBe("");

    const hydrated = hydrateChatImages(restored ?? [], new Map([[img.id, img.data]]));

    expect(hydrated[0]?.messages[0]?.images).toEqual([img]);
    expect(hydrated[0]?.draftAttachments[0]?.payload.data).toBe(img.data);
    expect(hydrated[0]?.draftAttachments[0]?.preview).toBe(
      `data:${img.media_type};base64,${img.data}`,
    );
  });

  it("гидратация кладёт в payload только то, что уезжает в API", () => {
    const chats = [
      chatWith([], { draftAttachments: [{ id: img.id, payload: img, preview: "data:..." }] }),
    ];
    const restored = deserializeChats(serializeChats(chats)) ?? [];

    const hydrated = hydrateChatImages(restored, new Map([[img.id, img.data]]));

    expect(hydrated[0]?.draftAttachments[0]?.payload).toEqual({
      media_type: img.media_type,
      data: img.data,
    });
  });

  it("картинка, файл которой пропал, выпадает из сообщения", () => {
    const chats = [chatWith([{ role: "user", text: "что тут?", images: [img] }])];
    const restored = deserializeChats(serializeChats(chats)) ?? [];

    const hydrated = hydrateChatImages(restored, new Map());

    expect(hydrated[0]?.messages[0]?.images).toEqual([]);
    expect(hydrated[0]?.messages[0]?.text).toBe("что тут?");
  });

  it("chatImageIds собирает ссылки без повторов и без незаписанных", () => {
    const chats = [
      chatWith([{ role: "user", text: "раз", images: [img, { ...img, id: "" }] }], {
        draftAttachments: [{ id: img.id, payload: img, preview: "" }],
      }),
    ];
    expect(chatImageIds(chats)).toEqual([img.id]);
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

  it("сохраняет thinkingEnabled при round-trip; старый json без него → false", () => {
    const chats = [chatWith([], { thinkingEnabled: true })];
    expect(deserializeChats(serializeChats(chats))?.[0]?.thinkingEnabled).toBe(true);
    const old = deserializeChats('[{"id":"a","title":"Чат 1","messages":[],"draft":""}]');
    expect(old?.[0]?.thinkingEnabled).toBe(false);
  });

  it("сохраняет model при round-trip; старый json без него → дефолтная модель", () => {
    const chats = [chatWith([], { model: "claude-opus-4-8" })];
    expect(deserializeChats(serializeChats(chats))?.[0]?.model).toBe("claude-opus-4-8");
    const old = deserializeChats('[{"id":"a","title":"Чат 1","messages":[],"draft":""}]');
    expect(old?.[0]?.model).toBe("claude-haiku-4-5-20251001");
  });

  it("сохраняет webSearch при round-trip; старый json без него → false", () => {
    const chats = [chatWith([], { webSearch: true })];
    expect(deserializeChats(serializeChats(chats))?.[0]?.webSearch).toBe(true);
    const old = deserializeChats('[{"id":"a","title":"Чат 1","messages":[],"draft":""}]');
    expect(old?.[0]?.webSearch).toBe(false);
  });

  it("сохраняет context при round-trip (текст переживает диск); старый json → ''", () => {
    const chats = [chatWith([], { context: "вакансия: senior rust" })];
    expect(deserializeChats(serializeChats(chats))?.[0]?.context).toBe("вакансия: senior rust");
    const old = deserializeChats('[{"id":"a","title":"Чат 1","messages":[],"draft":""}]');
    expect(old?.[0]?.context).toBe("");
  });
});

/**
 * The reader and the model cannot drift any more: the on-disk schema declares
 * exactly the fields `Chat` has, and this assertion is what says so. Thirteen
 * hand-written `typeof` checks used to be the reader, and adding a field to
 * `Chat` broke neither the build nor a test — it simply came back missing after
 * a restart. Modelled on the `SameKeys` assertions in `ipc/contract.test.ts`.
 */
type SameKeys<A, B> = [keyof A] extends [keyof B]
  ? [keyof B] extends [keyof A]
    ? true
    : never
  : never;

const schemaCoversEveryChatField: SameKeys<StoredChat, Chat> = true;

describe("схема хранения чата", () => {
  it("описывает ровно те же поля, что и Chat", () => {
    expect(schemaCoversEveryChatField).toBe(true);
    const restored = deserializeChats(serializeChats([createChat(1)]))?.[0];
    expect(Object.keys(restored ?? {}).sort()).toEqual(Object.keys(createChat(1)).sort());
  });

  it("чинит поле, а не выбрасывает чат целиком", () => {
    const restored = deserializeChats(
      JSON.stringify([
        {
          id: "a",
          title: 5,
          messages: "не массив",
          thinkingEnabled: "да",
          lastInputTokens: -10,
          libraryDocIds: ["ok", 7],
        },
      ]),
    )?.[0];
    expect(restored?.id).toBe("a");
    // The stem is the dictionary's, the number is the position in the file —
    // a title missing from chats.json must never restore as an empty tab.
    expect(restored?.title).toBe(`${getDict().common.chat.untitled} 1`);
    expect(restored?.messages).toEqual([]);
    expect(restored?.thinkingEnabled).toBe(false);
    expect(restored?.lastInputTokens).toBe(0);
    expect(restored?.libraryDocIds).toEqual(["ok"]);
  });

  it("выдаёт чату без id новый — иначе его нельзя ни выбрать, ни удалить", () => {
    const restored = deserializeChats('[{"title":"Чат","messages":[]}]')?.[0];
    expect(restored?.id).not.toBe("");
  });
});
