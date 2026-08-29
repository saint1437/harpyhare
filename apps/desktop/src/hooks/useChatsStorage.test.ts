import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadChats = vi.fn<() => Promise<string>>();
const saveChats = vi.fn<(json: string) => Promise<void>>();
const saveChatImage = vi.fn<(mediaType: string, dataBase64: string) => Promise<string>>();
const loadChatImages = vi.fn<(ids: string[]) => Promise<{ id: string; dataBase64: string }[]>>();
const pruneChatImages = vi.fn<(keep: string[]) => Promise<void>>();
vi.mock("@/ipc/commands", () => ({
  loadChats: () => loadChats(),
  saveChats: (json: string) => saveChats(json),
  saveChatImage: (mediaType: string, dataBase64: string) => saveChatImage(mediaType, dataBase64),
  loadChatImages: (ids: string[]) => loadChatImages(ids),
  pruneChatImages: (keep: string[]) => pruneChatImages(keep),
}));

import { addDraftAttachments, addDraftStoredImage } from "@/state/chat-attachments";
import {
  getActiveChat,
  getActiveChatId,
  getChats,
  newChat,
  patchChat,
  resetChatsState,
  selectChat,
} from "@/state/chats";
import { useChatsStorage } from "./useChatsStorage";

const IMAGE_ID = "00000000000000aa.png";
const DRAFT_MARKER = "черновик после сбоя";
const SAVE_WAIT_MS = 3000;
/** `btoa` of three zero bytes — what a pasted 3-byte PNG encodes to. */
const IMAGE_BASE64 = "AAAA";

/**
 * A paste of one PNG. This is the path that still hands bytes to
 * `save_chat_image`; the screenshot path arrives as a reference instead.
 */
function pastedPng(): DataTransferItemList {
  const file = new File([new Uint8Array(3)], "x.png", { type: "image/png" });
  return [
    { kind: "file", type: "image/png", getAsFile: () => file },
  ] as unknown as DataTransferItemList;
}

/** Mounting the storage hook is what starts the load; the store is the result. */
function mount() {
  return renderHook(() => {
    useChatsStorage();
  });
}

async function mountLoaded(): Promise<void> {
  mount();
  await waitFor(() => {
    expect(getChats().length).toBeGreaterThan(0);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  loadChats.mockResolvedValue("");
  saveChats.mockResolvedValue(undefined);
  saveChatImage.mockResolvedValue(IMAGE_ID);
  loadChatImages.mockResolvedValue([]);
  pruneChatImages.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  if (vi.isFakeTimers()) vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.clearAllMocks();
  resetChatsState();
  localStorage.clear();
});

describe("useChatsStorage — картинки переживают перезапуск", () => {
  const savedChats = JSON.stringify([
    {
      id: "c1",
      title: "Чат 1",
      messages: [
        { role: "user", text: "что тут?", images: [{ id: IMAGE_ID, media_type: "image/png" }] },
      ],
      draft: "",
      draftAttachments: [],
    },
  ]);

  it("байты подтягиваются с диска по ссылке из chats.json", async () => {
    loadChats.mockResolvedValue(savedChats);
    loadChatImages.mockResolvedValue([{ id: IMAGE_ID, dataBase64: "AAAA" }]);

    mount();
    await waitFor(() => {
      expect(getActiveChat().messages.length).toBe(1);
    });

    expect(loadChatImages).toHaveBeenCalledWith([IMAGE_ID]);
    expect(getActiveChat().messages[0]?.images).toEqual([
      { id: IMAGE_ID, media_type: "image/png", data: "AAAA" },
    ]);
  });

  it("картинка без файла на диске выпадает, а текст сообщения остаётся", async () => {
    loadChats.mockResolvedValue(savedChats);
    loadChatImages.mockResolvedValue([]);

    mount();
    await waitFor(() => {
      expect(getActiveChat().messages.length).toBe(1);
    });

    expect(getActiveChat().messages[0]?.images).toEqual([]);
    expect(getActiveChat().messages[0]?.text).toBe("что тут?");
  });

  it("после загрузки чистит хранилище от картинок, на которые никто не ссылается", async () => {
    loadChats.mockResolvedValue(savedChats);
    loadChatImages.mockResolvedValue([{ id: IMAGE_ID, dataBase64: "AAAA" }]);

    mount();
    await waitFor(() => {
      expect(getActiveChat().messages.length).toBe(1);
    });

    await waitFor(() => {
      expect(pruneChatImages).toHaveBeenCalledWith([IMAGE_ID]);
    });
  });

  it("сбой записи оставляет вложение в сессии, но не в chats.json", async () => {
    vi.useRealTimers();
    saveChatImage.mockRejectedValue(new Error("диск недоступен"));
    await mountLoaded();

    await act(async () => {
      await addDraftAttachments(getActiveChatId(), pastedPng());
    });

    expect(saveChatImage).toHaveBeenCalledWith("image/png", IMAGE_BASE64);
    expect(getActiveChat().draftAttachments).toHaveLength(1);
    expect(getActiveChat().draftAttachments[0]?.id).toBe("");
    expect(getActiveChat().draftAttachments[0]?.payload.data).toBe("AAAA");

    act(() => {
      patchChat(getActiveChatId(), { draft: DRAFT_MARKER });
    });
    await waitFor(
      () => {
        expect(saveChats.mock.calls.at(-1)?.[0] ?? "").toContain(DRAFT_MARKER);
      },
      { timeout: SAVE_WAIT_MS },
    );

    const saved = JSON.parse(saveChats.mock.calls.at(-1)?.[0] ?? "[]") as {
      draftAttachments: unknown[];
    }[];
    expect(saved[0]?.draftAttachments).toEqual([]);
  });

  it("вложение записывается на диск и получает оттуда id", async () => {
    vi.useRealTimers();
    await mountLoaded();

    await act(async () => {
      await addDraftAttachments(getActiveChatId(), pastedPng());
    });

    expect(saveChatImage).toHaveBeenCalledWith("image/png", IMAGE_BASE64);
    expect(getActiveChat().draftAttachments[0]?.id).toBe(IMAGE_ID);
  });
});

/**
 * The снимок области приходит СССЫЛКОЙ: файл уже лежит в хранилище, а байты
 * фронтенд берёт тем же `load_chat_images`, которым поднимает картинки
 * восстановленного чата. Ни `save_chat_image`, ни base64 в событии тут больше
 * не участвуют.
 */
describe("useChatsStorage — снимок области приходит ссылкой", () => {
  it("вложение собирается из хранилища, а не пишется туда заново", async () => {
    vi.useRealTimers();
    loadChatImages.mockResolvedValue([{ id: IMAGE_ID, dataBase64: IMAGE_BASE64 }]);
    await mountLoaded();
    loadChatImages.mockClear();

    await act(async () => {
      await addDraftStoredImage(getActiveChatId(), IMAGE_ID, "image/png");
    });

    expect(loadChatImages).toHaveBeenCalledWith([IMAGE_ID]);
    expect(saveChatImage).not.toHaveBeenCalled();
    const attachment = getActiveChat().draftAttachments[0];
    expect(attachment?.id).toBe(IMAGE_ID);
    expect(attachment?.payload).toEqual({ media_type: "image/png", data: IMAGE_BASE64 });
    expect(attachment?.preview).toBe(`data:image/png;base64,${IMAGE_BASE64}`);
  });

  it("ссылка без файла не даёт вложения — байтов нет ни для миниатюры, ни для запроса", async () => {
    vi.useRealTimers();
    await mountLoaded();
    loadChatImages.mockResolvedValue([]);

    await act(async () => {
      await addDraftStoredImage(getActiveChatId(), IMAGE_ID, "image/png");
    });

    expect(getActiveChat().draftAttachments).toEqual([]);
  });

  it("уборка не трогает файл, на который ссылается черновик", async () => {
    vi.useRealTimers();
    loadChatImages.mockResolvedValue([{ id: IMAGE_ID, dataBase64: IMAGE_BASE64 }]);
    await mountLoaded();

    await act(async () => {
      await addDraftStoredImage(getActiveChatId(), IMAGE_ID, "image/png");
    });

    const saved = await waitFor(() => {
      const json = saveChats.mock.calls.at(-1)?.[0];
      expect(json).toBeDefined();
      return JSON.parse(json ?? "[]") as { draftAttachments: { id: string }[] }[];
    });
    expect(saved[0]?.draftAttachments).toEqual([{ id: IMAGE_ID, media_type: "image/png" }]);
  });
});

describe("useChatsStorage", () => {
  it("стартует с одним пустым чатом, если на диске пусто", async () => {
    await mountLoaded();
    expect(getChats().length).toBe(1);
    expect(getActiveChat().messages).toEqual([]);
    expect(getActiveChatId()).toBe(getChats()[0]?.id);
  });

  it("дебаунсит сохранение на диск", async () => {
    await mountLoaded();
    saveChats.mockClear();
    act(() => {
      newChat();
    });
    expect(saveChats).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(saveChats).toHaveBeenCalledTimes(1);
  });

  it("addDraftStoredImage добавляет вложение в черновик активного чата", async () => {
    vi.useRealTimers();
    loadChatImages.mockResolvedValue([{ id: IMAGE_ID, dataBase64: IMAGE_BASE64 }]);
    await mountLoaded();
    await act(async () => {
      await addDraftStoredImage(getActiveChatId(), IMAGE_ID, "image/png");
    });
    expect(getActiveChat().draftAttachments).toHaveLength(1);
    expect(getActiveChat().draftAttachments[0]?.payload.media_type).toBe("image/png");
  });
});

describe("useChatsStorage — активный чат переживает выход", () => {
  const STORAGE_KEY = "active-chat-id";
  const TWO_CHATS = JSON.stringify([
    { id: "one", title: "Чат 1", messages: [], draft: "" },
    { id: "two", title: "Чат 2", messages: [], draft: "" },
  ]);

  it("открывается тот чат, в котором вышли, а не первый", async () => {
    localStorage.setItem(STORAGE_KEY, "two");
    loadChats.mockResolvedValue(TWO_CHATS);
    mount();
    await waitFor(() => {
      expect(getChats().length).toBe(2);
    });
    expect(getActiveChatId()).toBe("two");
  });

  it("если запомненный чат удалён, открывается первый", async () => {
    localStorage.setItem(STORAGE_KEY, "которого-нет");
    loadChats.mockResolvedValue(TWO_CHATS);
    mount();
    await waitFor(() => {
      expect(getChats().length).toBe(2);
    });
    expect(getActiveChatId()).toBe("one");
  });

  it("переключение чата запоминается сразу", async () => {
    loadChats.mockResolvedValue(TWO_CHATS);
    mount();
    await waitFor(() => {
      expect(getChats().length).toBe(2);
    });
    act(() => {
      selectChat("two");
    });
    await waitFor(() => {
      expect(localStorage.getItem(STORAGE_KEY)).toBe("two");
    });
  });

  // Черновик живёт в том же сторе, поэтому каждый символ публикует изменение —
  // а id меняется только на переключении. Подложенное снаружи значение видно,
  // что записи не было: раньше её делал любой чих в сторе.
  it("правка черновика не переписывает запомненный id", async () => {
    loadChats.mockResolvedValue(TWO_CHATS);
    mount();
    await waitFor(() => {
      expect(getChats().length).toBe(2);
    });
    act(() => {
      selectChat("two");
    });
    await waitFor(() => {
      expect(localStorage.getItem(STORAGE_KEY)).toBe("two");
    });

    localStorage.setItem(STORAGE_KEY, "подложено");
    act(() => {
      patchChat("two", { draft: "п" });
      patchChat("two", { draft: "пр" });
    });
    expect(localStorage.getItem(STORAGE_KEY)).toBe("подложено");

    act(() => {
      selectChat("one");
    });
    expect(localStorage.getItem(STORAGE_KEY)).toBe("one");
  });
});
