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

import { addDraftImage } from "@/state/chat-attachments";
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
      await addDraftImage(getActiveChatId(), "data:image/png;base64,AAAA", "image/png");
    });

    expect(saveChatImage).toHaveBeenCalledWith("image/png", "AAAA");
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
      await addDraftImage(getActiveChatId(), "data:image/png;base64,AAAA", "image/png");
    });

    expect(saveChatImage).toHaveBeenCalledWith("image/png", "AAAA");
    expect(getActiveChat().draftAttachments[0]?.id).toBe(IMAGE_ID);
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

  it("addDraftImage добавляет вложение в черновик активного чата", async () => {
    vi.useRealTimers();
    await mountLoaded();
    const dataUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC";
    await act(async () => {
      await addDraftImage(getActiveChatId(), dataUrl, "image/png");
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
});
